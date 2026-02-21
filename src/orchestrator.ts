/**
 * FOREMAN — Orchestrator
 *
 * Tam pipeline: task → vision → decompose → research → execute → verify → reflect
 *
 * Pipeline'ın kendisi enforce eder:
 * - Vision çıktısı parse edilemezse → BLOCK
 * - Decompose'dan blok çıkmazsa → BLOCK
 * - Worker 8-adım protokolü eksikse → retry → BLOCK
 * - Parse başarısızlığında 2 retry
 * - Düşük confidence'ta BLOCK sinyali
 * - Her 5 atomda reflection (vizyon sapması kontrolü)
 */

import { Engine } from "./engine.js";
import type { StepResult } from "./engine.js";
import type { Layer, Thought, Chain } from "./types.js";
import type { DecomposeParseResult, AtomizeParseResult } from "./parser.js";

// ─── EVENTS ──────────────────────────────────────────────────

export type OrchestratorEvent =
  | { type: "phase_start"; phase: string; detail: string }
  | { type: "phase_end"; phase: string; detail: string }
  | { type: "thought_complete"; thought: Thought }
  | { type: "block_detected"; thought: Thought; reason: string }
  | { type: "format_retry"; phase: string; attempt: number; missing: string[] }
  | { type: "reflection"; summary: string; atomCount: number }
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
   * Thought BLOCK kontrolü.
   * Parse başarısız, validation fail, veya katman bazlı düşük confidence → BLOCK.
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

    // Katman bazlı confidence — engine zaten threshold kontrolü yaptı
    // Ama engine "warn" veriyorsa orchestrator bilgilendirilmeli
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
   * Tam pipeline çalıştır.
   *
   * Session, memory, cache — hepsi otomatik yönetilir.
   * Kullanıcı sadece `foreman run "görev"` der.
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
    // Kullanıcı session start/end ile uğraşmaz — pipeline kendi yönetir
    const session = this.engine.sessions.start({
      projectId: this.engine.state.snapshot().projectName,
    });

    // ─── MEMORY CLEANUP ─────────────────────────────────────
    // Her run başında expired/cold memory'leri temizle
    this.engine.memory.cleanup();

    // ─── CACHE PURGE ────────────────────────────────────────
    // Süresi dolmuş cache entry'lerini sil
    this.engine.cache.purgeExpired();

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
      return this.buildResult(false, totalThoughts, visionChain.id, "vision");
    }

    const visionOutput = visionResult.thought.output;
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

    // Parse edilmiş blokları AL — artık string parse değil, yapısal data
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

      const researchResult = await this.engine.stepWithPhase(
        visionChain.id,
        `Research best practices, examples, and technical considerations for this block:\n\n${block}\n\nContext (vision):\n${visionOutput.slice(0, 500)}`,
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

      // Parse edilmiş atomları AL
      const atoms: string[] = atomizeResult.parsed?.atoms
        ?? this.fallbackParseBlocks(atomizeResult.thought.output);

      if (atoms.length === 0) {
        this.emit({
          type: "block_detected",
          thought: atomizeResult.thought,
          reason: `No atoms extracted from block ${i + 1}`,
        });
        continue; // bu bloğu atla, sonrakine geç
      }

      // ── 3c. EXECUTE EACH ATOM ──
      for (let j = 0; j < atoms.length; j++) {
        const atom = atoms[j];

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

        // Worker BLOCK — 8-adım eksik veya confidence çok düşük
        if (execResult.thought.status === "blocked") {
          this.emit({
            type: "block_detected",
            thought: execResult.thought,
            reason: execResult.thought.blockedReason ?? "Worker protocol incomplete",
          });
          // Atom BLOCK non-fatal — sonraki atoma geç
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

        this.emit({ type: "phase_end", phase: "execute", detail: `Done: ${atom.slice(0, 40)}` });

        // ── REFLECT every 5 atoms ──
        if (atomCount > 0 && atomCount % 5 === 0) {
          this.emit({ type: "phase_start", phase: "reflect", detail: `Reflection after ${atomCount} atoms` });

          if (this.engine.state.canTransition("reflecting")) {
            this.engine.state.transition("reflecting", `Reflection after ${atomCount} atoms`);
          }

          const reflectResult = await this.engine.stepWithPhase(
            visionChain.id,
            `We've completed ${atomCount} atoms so far. Review the work done and check:\n1. Is it still aligned with the original vision?\n2. Any quality issues or drift?\n3. Should we adjust the plan?\n\nOriginal vision:\n${visionOutput.slice(0, 500)}`,
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
    }

    // ─── COMPLETE ───────────────────────────────────────────

    if (this.engine.state.canTransition("verifying")) {
      this.engine.state.transition("verifying", "Pipeline execution complete, final verify");
    }
    if (this.engine.state.canTransition("complete")) {
      this.engine.state.transition("complete", "Pipeline complete");
    }

    // ─── SESSION AUTO-END ───────────────────────────────────
    this.engine.sessions.end(
      session.id,
      "completed",
      `${task.slice(0, 80)} — ${totalThoughts} thoughts, ${atomCount} atoms`,
    );

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

    return { success, totalThoughts, totalTokens, visionChainId, blockedAt };
  }

  /**
   * Fallback: parse edilmiş data yoksa eski yöntemle blok/atom parse et.
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
