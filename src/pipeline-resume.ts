/**
 * FOREMAN — Pipeline Resume Engine
 *
 * Save and restore pipeline state for continuation after interruption.
 * When a pipeline is interrupted (crash, timeout, Ctrl+C), the next
 * `foreman run` can resume from the last checkpoint.
 *
 * Capabilities:
 * - Checkpoint saving at each phase boundary
 * - Vision/decompose/research/atom state persistence
 * - Resume detection on startup
 * - Partial results preservation
 * - Checkpoint cleanup after completion
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface PipelineCheckpoint {
  id: string;
  task: string;
  startedAt: number;
  updatedAt: number;
  phase: PipelinePhase;
  chainId: string;

  /** Vision output */
  visionOutput?: string;
  /** Decomposed blocks */
  blocks?: string[];
  /** Research findings per block */
  researchFindings?: string[];
  /** Atoms per block */
  atoms?: string[][];
  /** Completed atom indices */
  completedAtoms: number[];
  /** Current block index */
  currentBlock: number;
  /** Current atom index within block */
  currentAtom: number;
  /** Total thoughts so far */
  totalThoughts: number;
  /** Total tokens so far */
  totalTokens: number;
}

export type PipelinePhase =
  | "vision"
  | "decompose"
  | "research"
  | "atomize"
  | "execute"
  | "verify"
  | "reflect"
  | "complete"
  | "failed";

// ─── PIPELINE RESUME ENGINE ──────────────────────────────────

export class PipelineResumeEngine {
  private checkpointPath: string;

  constructor(projectRoot: string) {
    this.checkpointPath = join(projectRoot, ".foreman", "pipeline-checkpoint.json");
  }

  /**
   * Check if there's a resumable checkpoint.
   */
  hasCheckpoint(): boolean {
    return existsSync(this.checkpointPath);
  }

  /**
   * Load the current checkpoint.
   */
  loadCheckpoint(): PipelineCheckpoint | null {
    try {
      if (!existsSync(this.checkpointPath)) return null;
      const raw = readFileSync(this.checkpointPath, "utf-8");
      return JSON.parse(raw) as PipelineCheckpoint;
    } catch {
      return null;
    }
  }

  /**
   * Create a new checkpoint (start of pipeline).
   */
  createCheckpoint(task: string, chainId: string): PipelineCheckpoint {
    const checkpoint: PipelineCheckpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      task,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      phase: "vision",
      chainId,
      completedAtoms: [],
      currentBlock: 0,
      currentAtom: 0,
      totalThoughts: 0,
      totalTokens: 0,
    };

    this.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  /**
   * Update checkpoint after a phase completes.
   */
  updatePhase(phase: PipelinePhase, data?: Partial<PipelineCheckpoint>): void {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return;

    checkpoint.phase = phase;
    checkpoint.updatedAt = Date.now();

    if (data) {
      if (data.visionOutput !== undefined) checkpoint.visionOutput = data.visionOutput;
      if (data.blocks !== undefined) checkpoint.blocks = data.blocks;
      if (data.researchFindings !== undefined) checkpoint.researchFindings = data.researchFindings;
      if (data.atoms !== undefined) checkpoint.atoms = data.atoms;
      if (data.currentBlock !== undefined) checkpoint.currentBlock = data.currentBlock;
      if (data.currentAtom !== undefined) checkpoint.currentAtom = data.currentAtom;
      if (data.totalThoughts !== undefined) checkpoint.totalThoughts = data.totalThoughts;
      if (data.totalTokens !== undefined) checkpoint.totalTokens = data.totalTokens;
    }

    this.saveCheckpoint(checkpoint);
  }

  /**
   * Mark an atom as completed.
   */
  completeAtom(blockIndex: number, atomIndex: number, thoughts: number, tokens: number): void {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return;

    const atomKey = blockIndex * 1000 + atomIndex;
    if (!checkpoint.completedAtoms.includes(atomKey)) {
      checkpoint.completedAtoms.push(atomKey);
    }
    checkpoint.currentBlock = blockIndex;
    checkpoint.currentAtom = atomIndex + 1;
    checkpoint.totalThoughts += thoughts;
    checkpoint.totalTokens += tokens;
    checkpoint.updatedAt = Date.now();

    this.saveCheckpoint(checkpoint);
  }

  /**
   * Mark a block as fully completed — advance to next block.
   */
  completeBlock(blockIndex: number, passedAtoms: number, totalAtoms: number): void {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return;

    checkpoint.currentBlock = blockIndex + 1;
    checkpoint.currentAtom = 0;
    checkpoint.updatedAt = Date.now();

    this.saveCheckpoint(checkpoint);
  }

  /**
   * Check if a specific atom has been completed (for resume skip).
   */
  isAtomCompleted(blockIndex: number, atomIndex: number): boolean {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return false;
    return checkpoint.completedAtoms.includes(blockIndex * 1000 + atomIndex);
  }

  /**
   * Get resume point — which block and atom to start from.
   */
  getResumePoint(): { phase: PipelinePhase; block: number; atom: number } | null {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return null;

    return {
      phase: checkpoint.phase,
      block: checkpoint.currentBlock,
      atom: checkpoint.currentAtom,
    };
  }

  /**
   * Clear checkpoint (pipeline completed or abandoned).
   */
  clearCheckpoint(): void {
    try {
      if (existsSync(this.checkpointPath)) {
        unlinkSync(this.checkpointPath);
      }
    } catch { /* best-effort */ }
  }

  /**
   * Get human-readable status of the checkpoint.
   */
  getStatus(): string | null {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return null;

    const age = Math.round((Date.now() - checkpoint.updatedAt) / 60_000);
    const completedCount = checkpoint.completedAtoms.length;
    const totalAtoms = checkpoint.atoms?.reduce((sum, a) => sum + a.length, 0) ?? 0;

    return [
      `Task: ${checkpoint.task.slice(0, 60)}`,
      `Phase: ${checkpoint.phase}`,
      `Progress: ${completedCount}/${totalAtoms} atoms`,
      `Block: ${checkpoint.currentBlock + 1}/${checkpoint.blocks?.length ?? "?"}`,
      `Thoughts: ${checkpoint.totalThoughts}`,
      `Tokens: ${checkpoint.totalTokens}`,
      `Last updated: ${age}min ago`,
    ].join("\n");
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private saveCheckpoint(checkpoint: PipelineCheckpoint): void {
    try {
      const dir = dirname(this.checkpointPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf-8");
    } catch { /* best-effort */ }
  }
}
