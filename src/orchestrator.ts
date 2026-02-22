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
import { PipelineResumeEngine } from "./pipeline-resume.js";
import { createEngineToolExecutor, TOOL_DEFINITIONS } from "./tools.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { formatProjectContext } from "./project-detector.js";
import { webSearch, fetchUrl, npmInfo } from "./research-engine.js";
import { extractToolCalls, extractToolResults } from "./transcript-repair.js";
import { getActiveThoughts } from "./chain-repair.js";
import { validateReasoning, validateOutput, validateConfidence, validateWorkerProtocol, validateProtocolSteps } from "./validators.js";

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
  | { type: "error"; message: string };

export type EventListener = (event: OrchestratorEvent) => void;

// ─── ORCHESTRATOR ────────────────────────────────────────────

export class Orchestrator {
  private engine: Engine;
  readonly resume: PipelineResumeEngine;
  private listeners: EventListener[] = [];

  constructor(engine: Engine) {
    this.engine = engine;
    this.resume = new PipelineResumeEngine(engine.config.projectRoot);
  }

  on(listener: EventListener): void {
    this.listeners.push(listener);
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
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
    const confLevel = this.engine.evaluateConfidence(result.thought.layer as any, result.thought.confidence);
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
    this.engine.streaming.pipelineStart(task);

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

    // ─── SESSION LIFECYCLE — create named forge session ─────
    const forgeSession = this.engine.sessionLifecycle.create({
      task,
      phase: "vision",
    });
    this.engine.streaming.phaseStart("session", `Session: ${forgeSession.slug}`);

    // ─── IDENTITY — learn from memory ───────────────────────
    // Load identity context once for the pipeline
    this.engine.identity.reload();

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

    if (this.checkBlock(visionResult, "vision")) {
      this.engine.chains.updateStatus(visionChain.id, "blocked");
      return this.buildResult(false, totalThoughts, visionChain.id, "vision");
    }

    const visionOutput = visionResult.thought.output;
    this.engine.chains.updateSummary(visionChain.id, visionOutput.slice(0, 500));
    this.emit({ type: "phase_end", phase: "vision", detail: visionOutput.slice(0, 100) });
    this.engine.streaming.phaseEnd("vision", visionOutput.slice(0, 100));

    // ─── CHECKPOINT: Vision complete ───
    this.resume.createCheckpoint(task, visionChain.id);
    this.resume.updatePhase("decompose", { visionOutput });

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
      `Based on this VISION DOCUMENT, break the project into 5-8 implementable blocks.\n\nRules:\n- Each block must serve the vision's EMOTION TARGET\n- Each block must respect the FORBIDDEN list\n- Order blocks by dependency AND by visual importance (focal point first)\n- Each block needs clear acceptance criteria derived from the vision\n\nVISION DOCUMENT:\n${visionOutput}`,
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
      type: "feature" as any,
      priority: "high" as any,
    });
    this.engine.tasks.addChain(parentTask.id, visionChain.id);

    for (let bi = 0; bi < blocks.length; bi++) {
      const blockTask = this.engine.tasks.create({
        title: `Block ${bi + 1}: ${blocks[bi].slice(0, 60)}`,
        description: blocks[bi],
        projectId: this.engine.state.snapshot().projectName,
        type: "feature" as any,
        priority: "medium" as any,
      });
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

    // ─── 3. FOR EACH BLOCK ──────────────────────────────────

    let atomCount = 0;

    for (let i = 0; i < blocks.length; i++) {
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
          const embResults = this.engine.embeddingEngine.search(block, 3);
          if (embResults.length > 0) {
            embeddingContext = embResults.map(r =>
              `[${(r.score * 100).toFixed(0)}% match] ${r.content.slice(0, 120)}`
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

      // Web research augmentation — search for real context before LLM call
      let webContext = "";
      try {
        const searchResults = await webSearch(block.slice(0, 80), 3);
        if (searchResults.length > 0) {
          // Classify URLs via LinkIntelligence for richer context
          const enriched = searchResults.map(r => {
            const classification = this.engine.linkIntelligence.classify(r.url ?? "");
            const typeLabel = classification.type !== "unknown" ? ` [${classification.type}]` : "";
            return `- ${r.title}${typeLabel}: ${r.snippet}`;
          });
          webContext = "\n\nWeb research findings:\n" + enriched.join("\n");
        }
      } catch {
        // Web search is best-effort
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

      const researchResult = await this.engine.stepWithPhase(
        visionChain.id,
        `Research best practices, examples, and technical considerations for this block:\n\n${block}\n\nVISION DOCUMENT (pinned — respect all constraints):\n${visionOutput}${memoryContext}${webContext}${crossChainCtx}`,
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
        `Break this block into 3-6 atomic tasks. Each atom must be independently executable and verifiable.\n\nRules:\n- Each atom must be specific enough that a Worker can execute it WITHOUT guessing\n- Include file paths, component names, or specific targets when possible\n- Order atoms by dependency (what must exist before the next step)\n- Each atom description should include acceptance criteria\n\nBlock: ${block}\n\nResearch findings:\n${findings.slice(0, 800)}\n\nVISION DOCUMENT (pinned — atoms must respect ALL constraints):\n${visionOutput}`,
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

      if (atoms.length === 0) {
        this.emit({
          type: "block_detected",
          thought: atomizeResult.thought,
          reason: `No atoms extracted from block ${i + 1}`,
        });
        continue; // skip this block, move to next
      }

      // ── 3c. EXECUTE EACH ATOM ──
      for (let j = 0; j < atoms.length; j++) {
        const atom = atoms[j];

        // Context window check — evaluate budget before each atom
        try {
          const ctxWindow = this.engine.getContextWindow();
          const ctxEval = this.engine.evaluateContext(
            "gpt-4o", // default model for budget check
            "",
            atom,
            findings.slice(0, 500),
          );
          if (!ctxEval.isSafe) {
            // Compact context before executing
            const compact = this.engine.buildCompactContextForChain(visionChain.id, ctxWindow.tokens / 2);
            if (compact && compact.length > 0) {
              this.emit({
                type: "phase_start",
                phase: "context_compact",
                detail: `Compacted context: ${compact.length} chars`,
              });
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

        // ─── PRE-ATOM GIT CHECKPOINT ────────────────────────
        // Deterministic rollback point BEFORE worker touches code
        // If worker BLOCKs → git reset --hard to this exact point
        try {
          const gitStatus = this.engine.git.executor.gitStatus();
          if (!gitStatus.clean) {
            this.engine.git.commitThought({
              message: `[pre-atom] Block ${i + 1}, Atom ${j + 1}: ${atom.slice(0, 40)}`,
              chainId: visionChain.id,
              thoughtId: "pre-atom",
              layer: "worker",
              atomIndex: j,
            });
          }
          this.engine.rollback.createPoint("atom", `Pre-atom ${j + 1}: ${atom.slice(0, 40)}`, {
            atomIndex: j, blockIndex: i, preExecution: true,
          });
        } catch { /* git checkpoint best-effort */ }

        if (this.engine.state.canTransition("executing")) {
          this.engine.state.transition("executing", `Executing atom ${j + 1}`, {
            chainId: visionChain.id,
          });
        }

        // ── WORKER EXECUTION — two modes: ──
        // Mode A: Tool-enabled (LLM calls tools in real-time) — preferred
        // Mode B: Fallback (LLM plans, Worker Executor extracts & runs post-hoc)

        let execResult: StepResult;
        let toolCallCount = 0;
        const toolResults: Array<{ name: string; success: boolean }> = [];

        try {
          // Mode A: Try tool-enabled execution
          const toolExecutor = createEngineToolExecutor(
            this.engine.config.projectRoot,
            this.engine.exec,
            this.engine.editEngine,
            this.engine.git,
            this.engine.linkIntelligence,
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

          const atomContext = [
            `YOUR TASK (Atom ${j + 1}/${atoms.length}): ${atom}`,
            `BLOCK: ${block}`,
            prevAtomContext,
            `VISION DOCUMENT (pinned — respect ALL constraints):\n${visionOutput}`,
            findings ? `RESEARCH FINDINGS:\n${findings.slice(0, 800)}` : "",
            atomCrossCtx || "",
            memoryContext ? `MEMORY:\n${memoryContext.slice(0, 500)}` : "",
          ].filter(Boolean).join("\n\n---\n\n");

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
              maxIterations: 15,
              onToken: () => {},
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
        } catch (toolError) {
          // Mode B: Fallback — standard stepWithPhase + post-hoc extraction
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
        this.emit({ type: "thought_complete", thought: execResult.thought });

        // ── POST-HOC EXECUTION (Mode B fallback) ──
        // Only if no tools were called in Mode A (toolCallCount === 0)
        if (toolCallCount === 0 && execResult.thought.workerProtocol && execResult.thought.status === "done") {
          const protocol = execResult.thought.workerProtocol;

          if (needsExecution(protocol)) {
            const ops = extractOperations(protocol);

            if (ops.length > 0) {
              this.emit({
                type: "phase_start",
                phase: "real_execute",
                detail: `${ops.length} operations from atom ${j + 1}`,
              });

              try {
                const execSummary = await executeOperations(
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
                  detail: `${execSummary.succeeded}/${execSummary.totalOps} succeeded`,
                });

                // Feed execution results back into thought for verification
                if (execSummary.output) {
                  const feedback = buildExecutionFeedback(execSummary);
                  // Append execution results to thought output
                  this.engine.thoughts.update(execResult.thought.id, {
                    output: (execResult.thought.output ?? "") + "\n\n" + feedback,
                  });
                }

                // Git checkpoint after successful execution
                if (execSummary.succeeded > 0) {
                  try {
                    this.engine.git.commitThought({
                      thoughtId: execResult.thought.id,
                      chainId: visionChain.id,
                      layer: "worker",
                      atomIndex: j,
                      message: `Atom ${j + 1}: ${atom.slice(0, 50)}`,
                    });
                  } catch { /* git checkpoint best-effort */ }
                }
              } catch (execErr) {
                this.emit({
                  type: "error",
                  message: `Execution failed for atom ${j + 1}: ${execErr instanceof Error ? execErr.message : String(execErr)}`,
                });
              }
            }
          }
        }

        // Worker BLOCK — 8-step incomplete or confidence too low
        if (execResult.thought.status === "blocked") {
          this.emit({
            type: "block_detected",
            thought: execResult.thought,
            reason: execResult.thought.blockedReason ?? "Worker protocol incomplete",
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
                detail: `Rolled back atom ${j + 1}: ${rollbackResult.message}`,
              });
              this.engine.streaming.error(`⏪ Atom ${j + 1} rolled back: ${execResult.thought.blockedReason?.slice(0, 60)}`);
            }
          } catch {
            // Rollback is best-effort — may fail on non-git projects
          }

          // Atom BLOCK non-fatal — move to next atom
          continue;
        }

        if (execResult.retryCount > 0) {
          this.emit({
            type: "format_retry",
            phase: "execute",
            attempt: execResult.retryCount,
            missing: [],
          });
        }

        // ── PER-THOUGHT VALIDATION — granular quality checks ──
        if (execResult.thought.status === "done") {
          const thought = execResult.thought;
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

        // ─── CHECKPOINT: Atom complete ───
        this.resume.completeAtom(i, j, 1, execResult.thought.tokenCost ?? 0);

        // ─── STREAMING: Atom end ───
        this.engine.streaming.atomEnd(j, execResult.thought.tokenCost ?? 0);

        // ─── ROLLBACK: Atom checkpoint ───
        this.engine.rollback.createPoint("atom", `Atom ${j + 1}: ${atom.slice(0, 50)}`, {
          atomIndex: j, blockIndex: i,
        });

        // ── VERIFY: Parse worker's step7_verify for actionable results ──
        if (execResult.thought.workerProtocol?.step7_verify) {
          const verifyText = execResult.thought.workerProtocol.step7_verify;

          // Pattern analysis — classify output as errors, warnings, info
          const patterns = analyzeOutput(verifyText);
          const errorPatterns = patterns.filter(p => p.type === "error");
          const warningPatterns = patterns.filter(p => p.type === "warning");

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

        // ── REFLECT every 5 atoms — Visioner as Art Director ──
        if (atomCount > 0 && atomCount % 5 === 0) {
          this.emit({ type: "phase_start", phase: "reflect", detail: `Reflection after ${atomCount} atoms` });
          this.engine.streaming.phaseStart("reflect", `Vision drift check after ${atomCount} atoms`);

          if (this.engine.state.canTransition("reflecting")) {
            this.engine.state.transition("reflecting", `Reflection after ${atomCount} atoms`);
          }

          // ─── VISUAL VIBE CHECK: Screenshot → Vision LLM ────
          // Take screenshot of running dev server and ask Visioner if it matches the vision
          let vibeCheckContext = "";
          try {
            const servers = await detectDevServers();
            const healthyServer = servers.find(s => s.healthy);
            if (healthyServer && this.engine.browser.checkAvailability()) {
              const screenshot = await this.engine.browser.screenshot(healthyServer.url, { fullPage: true });
              this.engine.streaming.toolCall("vibe_check", `Screenshot: ${screenshot.width}x${screenshot.height}`);

              // Ask vision model to evaluate the screenshot against the vision document
              try {
                const vibeResult = await this.engine.callLLM(
                  `You are a visual art director. Compare the screenshot description with the vision document below.
Rate alignment on a scale of 0.0-1.0. Identify specific violations or drift.
Be BRUTAL — "looks okay" is not acceptable. Either it matches the vision or it doesn't.`,
                  `VISION DOCUMENT:\n${visionOutput}\n\nSCREENSHOT INFO:\n` +
                  `Size: ${screenshot.width}x${screenshot.height}\n` +
                  `URL: ${healthyServer.url}\n\n` +
                  `Based on the screenshot capture, does the current UI match the vision's:\n` +
                  `1. EMOTION TARGET?\n2. FOCAL POINT?\n3. COLOR PHILOSOPHY?\n4. SPACE PHILOSOPHY?\n5. FORBIDDEN LIST violations?`,
                  "visioner",
                );
                vibeCheckContext = `\n\nVISUAL VIBE CHECK:\n${vibeResult.text.slice(0, 500)}`;
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

          // Get actual git diff for context-aware reflection
          let diffContext = "";
          try {
            const summary = this.engine.git.summarizeChanges();
            if (summary) {
              diffContext = `\n\nGit changes so far:\n${summary}`;
            }
          } catch { /* non-git project */ }

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
                  detail: `Vision violation → rolled back block ${i + 1}: ${rollbackResult.message}`,
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

      // ─── STREAMING: Block end ───
      this.engine.streaming.blockEnd(i);

      // ── GIT CHECKPOINT — save progress after each block with thought metadata ──
      try {
        const gitStatus = this.engine.git.executor.gitStatus();
        if (!gitStatus.clean) {
          // Get the last atom's thought for metadata
          const lastAtomThought = atoms.length > 0
            ? this.engine.thoughts.get(
                this.engine.chains.get(visionChain.id)?.thoughts.slice(-1)[0] ?? ""
              )
            : null;

          const commitResult = this.engine.git.commitThought({
            message: `Block ${i + 1}/${blocks.length}: ${block.slice(0, 50)}`,
            chainId: visionChain.id,
            thoughtId: lastAtomThought?.id ?? "unknown",
            layer: "worker",
            atomIndex: atomCount,
            atomTotal: atoms.length,
          });
          if (commitResult.success) {
            this.emit({
              type: "phase_end",
              phase: "git_checkpoint",
              detail: `Committed: ${commitResult.shortHash ?? "ok"} — Block ${i + 1}`,
            });
          }
        }
      } catch {
        // Git checkpoint is best-effort — don't fail pipeline
      }
    }

    // ─── COMPLETE ───────────────────────────────────────────

    if (this.engine.state.canTransition("verifying")) {
      this.engine.state.transition("verifying", "Pipeline execution complete, final verify");
    }

    // ─── CHAIN REPAIR — fix any orphaned refs from compaction ──
    const repairResult = this.engine.repairChain(visionChain.id);
    if (!repairResult.healthy) {
      this.emit({
        type: "error",
        message: `Chain repair found ${repairResult.repaired} issues: ${repairResult.details.slice(0, 200)}`,
      });
    }

    // ─── MEMORY SYNC — write memory to MEMORY.md ────────────
    this.engine.syncMemory();

    // ─── PROCESS REGISTRY — log spawned process lifecycle ───
    try {
      const running = this.engine.processRegistry.listRunning();
      const finished = this.engine.processRegistry.listFinished();
      if (running.length > 0 || finished.length > 0) {
        this.emit({
          type: "phase_end",
          phase: "process_registry",
          detail: `Processes: ${running.length} running, ${finished.length} finished`,
        });
      }
      // Kill any orphaned processes from this pipeline
      if (running.length > 0) {
        this.engine.processRegistry.killAll();
      }
    } catch { /* best-effort */ }

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
          if (regressions.hasRegressions) {
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
            passed: server.healthy,
            detail: `Dev server ${server.url}: ${server.statusCode} (${server.responseTimeMs}ms)`,
          });

          // ─── BROWSER: Visual verification of running servers ───
          if (server.healthy && this.engine.browser.checkAvailability()) {
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
      if (pstats.total > 0) {
        this.emit({
          type: "phase_end",
          phase: "process_summary",
          detail: `Processes: ${pstats.running} running, ${pstats.finished} finished, ${pstats.total} total`,
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
    this.engine.sessions.end(
      session.id,
      "completed",
      `${task.slice(0, 80)} — ${totalThoughts} thoughts, ${atomCount} atoms`,
    );

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
        `${task.slice(0, 80)} — ${totalThoughts} thoughts, ${atomCount} atoms, ${success ? "success" : "failed"}`,
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

    // Session auto-end on failure too
    if (!success) {
      const activeSession = this.engine.sessions.getActive();
      if (activeSession) {
        this.engine.sessions.end(
          activeSession.id,
          "completed",
          `Blocked at ${blockedAt} — ${totalThoughts} thoughts`,
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

    // ─── HOOKS — after_pipeline ─────────────────────────────
    this.engine.hooks.run("after_pipeline", { success, totalThoughts, totalTokens, blockedAt }).catch(() => {});

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
}

// ─── TOOL-MODE WORKER PROMPT ─────────────────────────────────

function getWorkerPromptForToolMode(): string {
  return `You are the WORKER of Foreman — a 4-layer AI coding agent orchestrator.

You have access to 47 real tools. Use them to complete the task.

## File Operations
- read_file: Read file contents (ALWAYS read before editing)
- write_file: Write/create files
- edit_file: Edit existing files (find & replace)
- edit_range: Edit specific line range in a file
- edit_undo: Undo last edit to a file
- batch_write: Write multiple files atomically
- batch_ops: Execute multiple operations in sequence
- delete_file: Delete a file
- search_files: Search for patterns across files
- search_in_files: Search file contents with regex
- grep: Search file contents (grep-style)
- list_dir: List directory contents
- diff_preview: Preview unified diff before writing a file

## Shell & Process
- bash: Run shell commands (npm, git, etc.)
- list_processes: List running background processes
- kill_processes: Kill running processes
- spawn_subagent: Spawn a sub-agent for parallel work

## Git Operations
- git_status: Get git working tree status
- git_commit: Commit staged changes
- git_diff: Show uncommitted changes
- git_log: Show commit history

## Build & Verify
- verify_build: Run build and parse errors
- verify_tests: Run tests and parse results

## Web & Research
- web_search: Search the web (Brave Search API)
- web_fetch: Fetch and extract content from a URL
- analyze_link: Classify and analyze a URL
- classify_url: Classify URL type (docs, repo, etc.)

## Browser Automation
- browser_navigate: Navigate to URL, get page info
- browser_screenshot: Take screenshot of a web page
- browser_extract: Extract text, links, headings from page
- browser_pdf: Generate PDF from web page

## Memory & Identity
- memory_read: Read from persistent memory
- memory_write: Write to persistent memory
- memory_search: Search persistent memory entries

## Analysis & Intelligence
- parse_markdown: Parse markdown into structured data
- cache_stats: Get cache hit/miss statistics
- extract_code: Extract code blocks from text
- semantic_search: Search with TF-IDF similarity
- security_scan: Scan project for security issues
- approval_audit: View command approval history

## Your Protocol
1. READ: Use read_file to understand what exists
2. PLAN: Decide what to change (think step by step)
3. EXECUTE: Use write_file/edit_file/bash to make changes
4. VERIFY: Use verify_build/verify_tests to confirm it works
5. REPORT: Summarize what you did

## Rules
- ONE atomic task at a time
- ALWAYS read before writing — do NOT hallucinate file contents
- ALWAYS verify after changing
- Use diff_preview before large file writes
- If something fails, try to fix it (up to 3 attempts)
- Report honestly — include failures
- Use browser_screenshot to visually verify UI changes
- Use memory_write to save important discoveries for future reference

After completing all tool calls, provide your final response with:
STEP6_EXECUTE: [what you did]
STEP7_VERIFY: [verification results]
STEP8_REPORT: [summary]
CONFIDENCE: [0.0-1.0]`;
}
