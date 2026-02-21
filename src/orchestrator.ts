/**
 * FOREMAN — Orchestrator
 *
 * Tam pipeline: task → vision → decompose → research → execute → verify → reflect
 * Her fazı sırayla çalıştırır, BLOCK durumunda durur.
 */

import { Engine } from "./engine.js";
import type { Layer, Thought, Chain } from "./types.js";

// ─── EVENTS ──────────────────────────────────────────────────

export type OrchestratorEvent =
  | { type: "phase_start"; phase: string; detail: string }
  | { type: "phase_end"; phase: string; detail: string }
  | { type: "thought_complete"; thought: Thought }
  | { type: "block_detected"; thought: Thought; reason: string }
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

  /**
   * Event listener ekle.
   */
  on(listener: EventListener): void {
    this.listeners.push(listener);
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Tam pipeline çalıştır.
   *
   * Akış:
   * 1. VISION — Vizyoner: projenin ruhunu tanımla
   * 2. DECOMPOSE — Stratejist: vizyonu bloklara parçala
   * 3. For each block:
   *    a. RESEARCH — Araştırmacı: blok için bilgi topla
   *    b. ATOMIZE — Stratejist: bloğu atomlara parçala
   *    c. For each atom:
   *       - EXECUTE — İşçi: atomu uygula
   *       - VERIFY — doğrula
   *    d. REFLECT — her 5 atomda geri bak
   */
  async run(task: string): Promise<{
    success: boolean;
    totalThoughts: number;
    totalTokens: number;
    visionChainId: string;
  }> {
    let totalThoughts = 0;

    // ─── 1. VISION ──────────────────────────────────────────

    this.emit({ type: "phase_start", phase: "vision", detail: task });

    const visionChain = this.engine.chains.create({
      name: `Vision: ${task.slice(0, 40)}`,
      goal: `Define the vision for: ${task}`,
      layer: "visioner",
    });

    // State: idle → visioning
    if (this.engine.state.canTransition("visioning")) {
      this.engine.state.transition("visioning", "Starting vision phase", {
        chainId: visionChain.id,
      });
    }

    const visionThought = await this.engine.step(
      visionChain.id,
      `Define the complete vision for this project. What should it feel like? What makes it unique? What are the design principles?\n\nProject: ${task}`,
      "visioner",
    );
    totalThoughts++;

    this.emit({ type: "thought_complete", thought: visionThought });

    if (visionThought.confidence < 0.5) {
      this.emit({
        type: "block_detected",
        thought: visionThought,
        reason: "Low confidence on vision — needs more context",
      });
      return { success: false, totalThoughts, totalTokens: this.engine.state.snapshot().totalTokens, visionChainId: visionChain.id };
    }

    this.emit({ type: "phase_end", phase: "vision", detail: visionThought.output.slice(0, 100) });

    // ─── 2. DECOMPOSE ───────────────────────────────────────

    this.emit({ type: "phase_start", phase: "decompose", detail: "Breaking vision into blocks" });

    // State: → decomposing
    if (this.engine.state.canTransition("decomposing")) {
      this.engine.state.transition("decomposing", "Vision complete, decomposing", {
        chainId: visionChain.id,
      });
    }

    const decomposeThought = await this.engine.step(
      visionChain.id,
      `Based on this vision, break the project into 5-8 implementable blocks. Each block should be independent enough to work on separately.\n\nVision:\n${visionThought.output}`,
      "strategist",
      [visionThought.id],
    );
    totalThoughts++;

    this.emit({ type: "thought_complete", thought: decomposeThought });
    this.emit({ type: "phase_end", phase: "decompose", detail: `${decomposeThought.output.slice(0, 100)}` });

    // Parse blocks from strategist output
    const blocks = this.parseBlocks(decomposeThought.output);

    // ─── 3. FOR EACH BLOCK: RESEARCH → ATOMIZE → EXECUTE ───

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

      const researchThought = await this.engine.step(
        visionChain.id,
        `Research best practices, examples, and technical considerations for this block:\n\n${block}\n\nContext (vision):\n${visionThought.output.slice(0, 500)}`,
        "researcher",
        [visionThought.id, decomposeThought.id],
      );
      totalThoughts++;

      this.emit({ type: "thought_complete", thought: researchThought });
      this.emit({ type: "phase_end", phase: "research", detail: researchThought.output.slice(0, 80) });

      // ── 3b. ATOMIZE ──
      this.emit({ type: "phase_start", phase: "atomize", detail: `Atomizing block ${i + 1}` });

      if (this.engine.state.canTransition("decomposing")) {
        this.engine.state.transition("decomposing", `Atomizing block ${i + 1}`, {
          chainId: visionChain.id,
        });
      }

      const atomizeThought = await this.engine.step(
        visionChain.id,
        `Break this block into 3-6 atomic tasks. Each atom must be independently executable and verifiable.\n\nBlock: ${block}\n\nResearch findings:\n${researchThought.output.slice(0, 500)}`,
        "strategist",
        [researchThought.id],
      );
      totalThoughts++;

      this.emit({ type: "thought_complete", thought: atomizeThought });

      const atoms = this.parseBlocks(atomizeThought.output);

      // ── 3c. EXECUTE EACH ATOM ──
      for (let j = 0; j < atoms.length; j++) {
        const atom = atoms[j];

        this.emit({ type: "phase_start", phase: "execute", detail: `Atom ${j + 1}/${atoms.length}: ${atom.slice(0, 50)}` });

        if (this.engine.state.canTransition("executing")) {
          this.engine.state.transition("executing", `Executing atom ${j + 1}`, {
            chainId: visionChain.id,
          });
        }

        const execThought = await this.engine.step(
          visionChain.id,
          atom,
          "worker",
          [atomizeThought.id, researchThought.id, visionThought.id],
        );
        totalThoughts++;
        atomCount++;

        this.emit({ type: "thought_complete", thought: execThought });

        // BLOCK check
        if (execThought.confidence < 0.3) {
          this.emit({
            type: "block_detected",
            thought: execThought,
            reason: `Very low confidence (${execThought.confidence}) on atom execution`,
          });
        }

        this.emit({ type: "phase_end", phase: "execute", detail: `Done: ${atom.slice(0, 40)}` });

        // ── REFLECT every 5 atoms ──
        if (atomCount % 5 === 0) {
          this.emit({ type: "phase_start", phase: "reflect", detail: `Reflection after ${atomCount} atoms` });

          if (this.engine.state.canTransition("reflecting")) {
            this.engine.state.transition("reflecting", `Reflection after ${atomCount} atoms`);
          }

          const reflectThought = await this.engine.step(
            visionChain.id,
            `We've completed ${atomCount} atoms so far. Review the work done and check:\n1. Is it still aligned with the original vision?\n2. Any quality issues or drift?\n3. Should we adjust the plan?\n\nOriginal vision:\n${visionThought.output.slice(0, 500)}`,
            "visioner",
            [visionThought.id],
          );
          totalThoughts++;

          this.emit({
            type: "reflection",
            summary: reflectThought.output.slice(0, 200),
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

    const totalTokens = this.engine.state.snapshot().totalTokens;

    this.emit({
      type: "pipeline_complete",
      totalThoughts,
      totalTokens,
    });

    return {
      success: true,
      totalThoughts,
      totalTokens,
      visionChainId: visionChain.id,
    };
  }

  /**
   * Stratejist output'undan blok/atom listesi parse et.
   * "Block 1: ...", "1. ...", "- ..." formatlarını tanır.
   */
  private parseBlocks(text: string): string[] {
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    const blocks: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // "Block 1: ...", "1. ...", "- ...", "* ..."
      const match = trimmed.match(/^(?:Block\s*\d+[:.]\s*|(\d+)[.)]\s*|[-*]\s*)(.*)/i);
      if (match) {
        const content = match[2]?.trim() ?? trimmed;
        if (content.length > 5) {
          blocks.push(content);
        }
      }
    }

    // Eğer parse edemediyse, tüm text'i tek blok olarak döndür
    if (blocks.length === 0) {
      return [text.trim()];
    }

    return blocks;
  }
}
