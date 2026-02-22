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
  private listeners: EventListener[] = [];

  constructor(engine: Engine) {
    this.engine = engine;
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

    // ─── SESSION AUTO-START ─────────────────────────────────
    // User doesn't deal with session start/end — pipeline manages it
    const session = this.engine.sessions.start({
      projectId: this.engine.state.snapshot().projectName,
    });

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
      `Define the complete vision for this project. What should it feel like? What makes it unique? What are the design principles?\n\nProject: ${task}`,
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

    // ─── 2. DECOMPOSE ───────────────────────────────────────

    this.emit({ type: "phase_start", phase: "decompose", detail: "Breaking vision into blocks" });

    if (this.engine.state.canTransition("decomposing")) {
      this.engine.state.transition("decomposing", "Vision complete, decomposing", {
        chainId: visionChain.id,
      });
    }

    const decomposeResult = await this.engine.stepWithPhase(
      visionChain.id,
      `Based on this vision, break the project into 5-8 implementable blocks. Each block should be independent enough to work on separately.\n\nVision:\n${visionOutput}`,
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

      // ── 3a. RESEARCH ──
      this.emit({ type: "phase_start", phase: "research", detail: `Block ${i + 1}: ${block}` });

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
        `Research best practices, examples, and technical considerations for this block:\n\n${block}\n\nContext (vision):\n${visionOutput.slice(0, 500)}${memoryContext}${webContext}${crossChainCtx}`,
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
        `Break this block into 3-6 atomic tasks. Each atom must be independently executable and verifiable.\n\nBlock: ${block}\n\nResearch findings:\n${findings.slice(0, 500)}`,
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

        if (this.engine.state.canTransition("executing")) {
          this.engine.state.transition("executing", `Executing atom ${j + 1}`, {
            chainId: visionChain.id,
          });
        }

        const execResult = await this.engine.stepWithPhase(
          visionChain.id,
          atom,
          "worker",
          "execute",
          [atomizeResult.thought.id, researchResult.thought.id, visionResult.thought.id],
        );
        totalThoughts++;
        atomCount++;
        this.emit({ type: "thought_complete", thought: execResult.thought });

        // Worker BLOCK — 8-step incomplete or confidence too low
        if (execResult.thought.status === "blocked") {
          this.emit({
            type: "block_detected",
            thought: execResult.thought,
            reason: execResult.thought.blockedReason ?? "Worker protocol incomplete",
          });
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

        // ── REFLECT every 5 atoms ──
        if (atomCount > 0 && atomCount % 5 === 0) {
          this.emit({ type: "phase_start", phase: "reflect", detail: `Reflection after ${atomCount} atoms` });

          if (this.engine.state.canTransition("reflecting")) {
            this.engine.state.transition("reflecting", `Reflection after ${atomCount} atoms`);
          }

          // Get actual git diff for context-aware reflection
          let diffContext = "";
          try {
            const summary = this.engine.git.summarizeChanges();
            if (summary) {
              diffContext = `\n\nGit changes so far:\n${summary}`;
            }
          } catch { /* non-git project */ }

          const reflectResult = await this.engine.stepWithPhase(
            visionChain.id,
            `We've completed ${atomCount} atoms so far. Review the work done and check:\n1. Is it still aligned with the original vision?\n2. Any quality issues or drift?\n3. Should we adjust the plan?\n\nOriginal vision:\n${visionOutput.slice(0, 500)}${diffContext}`,
            "visioner",
            "reflect",
            [visionResult.thought.id],
          );
          totalThoughts++;

          this.emit({
            type: "reflection",
            summary: reflectResult.thought.output.slice(0, 200),
            atomCount,
          });
        }
      }

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
