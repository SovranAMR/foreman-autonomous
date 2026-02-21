/**
 * FOREMAN — Thought Manager
 *
 * Manages thought objects as JSON files.
 * Her thought: {projectRoot}/thoughts/t_XXX.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Thought, Layer, ThoughtStatus } from "./types.js";

// ─── INPUT TYPES ──────────────────────────────────────────────

/**
 * Required fields when creating a thought.
 * id, createdAt, status otomatik doldurulur.
 */
export interface CreateThoughtInput {
  chainId: string;
  layer: Layer;
  input: string;
  contextRefs?: string[];
}

/**
 * Fields that can be changed when updating a thought.
 */
export interface UpdateThoughtInput {
  reasoning?: string;
  output?: string;
  confidence?: number;
  status?: ThoughtStatus;
  needsResearch?: boolean;
  researchQuery?: string;
  researchFindings?: string;
  needsVerification?: boolean;
  verificationMethod?: Thought["verificationMethod"];
  verified?: boolean;
  verificationFailure?: string;
  next?: string;
  blockedReason?: string;
  completedAt?: string;
  tokenCost?: number;
  model?: string;
  workerProtocol?: Thought["workerProtocol"];
}

/**
 * Thought listeleme filtresi.
 */
export interface ThoughtFilter {
  chainId?: string;
  layer?: Layer;
  status?: ThoughtStatus;
}

// ─── THOUGHT MANAGER ─────────────────────────────────────────

export class ThoughtManager {
  private readonly thoughtsDir: string;

  constructor(private readonly projectRoot: string) {
    this.thoughtsDir = join(projectRoot, "thoughts");
  }

  /**
   * Create a new thought.
   * ID is generated automatically (auto-increment).
   * Initial status: "pending".
   */
  create(input: CreateThoughtInput): Thought {
    this.ensureDir();

    const id = this.nextId();
    const thought: Thought = {
      id,
      chainId: input.chainId,
      layer: input.layer,
      input: input.input,
      contextRefs: input.contextRefs ?? [],

      reasoning: "",
      output: "",
      confidence: 0,

      needsResearch: false,
      needsVerification: false,

      status: "pending",

      createdAt: new Date().toISOString(),
    };

    this.writeToDisk(thought);
    return thought;
  }

  /**
   * Read a thought. Returns null if not found.
   */
  get(id: string): Thought | null {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const raw = readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as Thought;
    } catch {
      return null;
    }
  }

  /**
   * Update a thought (partial merge).
   * Throws error if not found.
   */
  update(id: string, patch: UpdateThoughtInput): Thought {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Thought not found: ${id}`);
    }

    const updated: Thought = { ...existing, ...patch };
    this.writeToDisk(updated);
    return updated;
  }

  /**
   * List all thoughts (optional filter).
   */
  list(filter?: ThoughtFilter): Thought[] {
    this.ensureDir();

    const files = readdirSync(this.thoughtsDir)
      .filter(f => f.startsWith("t_") && f.endsWith(".json"))
      .sort();

    const thoughts: Thought[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.thoughtsDir, file), "utf-8");
        const thought = JSON.parse(raw) as Thought;

        // Filter
        if (filter?.chainId && thought.chainId !== filter.chainId) continue;
        if (filter?.layer && thought.layer !== filter.layer) continue;
        if (filter?.status && thought.status !== filter.status) continue;

        thoughts.push(thought);
      } catch {
        // Skip corrupt file
      }
    }

    return thoughts;
  }

  /**
   * Check if a thought exists.
   */
  exists(id: string): boolean {
    return existsSync(this.filePath(id));
  }

  // ─── PRIVATE ────────────────────────────────────────────────

  private filePath(id: string): string {
    return join(this.thoughtsDir, `${id}.json`);
  }

  private writeToDisk(thought: Thought): void {
    const json = JSON.stringify(thought, null, 2);
    writeFileSync(this.filePath(thought.id), json, "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.thoughtsDir)) {
      mkdirSync(this.thoughtsDir, { recursive: true });
    }
  }

  /**
   * Generate next thought ID.
   * Scans existing files, highest number + 1.
   */
  private nextId(): string {
    this.ensureDir();
    const files = readdirSync(this.thoughtsDir)
      .filter(f => f.startsWith("t_") && f.endsWith(".json"));

    if (files.length === 0) return "t_001";

    const numbers = files.map(f => {
      const match = f.match(/t_(\d+)\.json$/);
      return match ? parseInt(match[1], 10) : 0;
    });

    const max = Math.max(...numbers);
    const next = max + 1;
    return `t_${next.toString().padStart(3, "0")}`;
  }
}
