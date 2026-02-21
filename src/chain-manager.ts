/**
 * FOREMAN — Chain Manager
 *
 * Manages chain objects as JSON files.
 * Each chain: {projectRoot}/chains/chain_XXX.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Chain, ChainStatus, Layer } from "./types.js";

// ─── INPUT TYPES ──────────────────────────────────────────────

/**
 * Required fields when creating a chain.
 */
export interface CreateChainInput {
  /** Manual id (optional — auto-increment if not provided) */
  id?: string;

  /** Human-readable name */
  name: string;

  /** Purpose — single sentence */
  goal: string;

  /** Dominant layer */
  layer: Layer;

  /** Parent chain (fractal decomposition) */
  parentChainId?: string;
}

// ─── CHAIN MANAGER ───────────────────────────────────────────

export class ChainManager {
  private readonly chainsDir: string;

  constructor(private readonly projectRoot: string) {
    this.chainsDir = join(projectRoot, "chains");
  }

  /**
   * Create a new chain.
   */
  create(input: CreateChainInput): Chain {
    this.ensureDir();

    const id = input.id ?? this.nextId();

    const chain: Chain = {
      id,
      name: input.name,
      goal: input.goal,
      layer: input.layer,
      parentChainId: input.parentChainId,
      thoughts: [],
      status: "active",
      contextSummary: "",
      createdAt: new Date().toISOString(),
    };

    this.writeToDisk(chain);
    return chain;
  }

  /**
   * Read a chain. Returns null if not found.
   */
  get(id: string): Chain | null {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const raw = readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as Chain;
    } catch {
      return null;
    }
  }

  /**
   * Add a thought to a chain.
   * Does not create the thought itself — only adds the reference.
   */
  addThought(chainId: string, thoughtId: string): Chain {
    const chain = this.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    // Duplicate check
    if (chain.thoughts.includes(thoughtId)) {
      return chain;
    }

    chain.thoughts.push(thoughtId);
    this.writeToDisk(chain);
    return chain;
  }

  /**
   * Update chain status.
   */
  updateStatus(chainId: string, status: ChainStatus): Chain {
    const chain = this.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    chain.status = status;
    if (status === "completed") {
      (chain as any).completedAt = new Date().toISOString();
    }
    this.writeToDisk(chain);
    return chain;
  }

  /**
   * Update chain context summary.
   */
  updateSummary(chainId: string, summary: string): Chain {
    const chain = this.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    chain.contextSummary = summary;
    this.writeToDisk(chain);
    return chain;
  }

  /**
   * List all chains.
   */
  list(statusFilter?: ChainStatus): Chain[] {
    this.ensureDir();

    const files = readdirSync(this.chainsDir)
      .filter(f => f.startsWith("chain_") && f.endsWith(".json"))
      .sort();

    const chains: Chain[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.chainsDir, file), "utf-8");
        const chain = JSON.parse(raw) as Chain;
        if (statusFilter && chain.status !== statusFilter) continue;
        chains.push(chain);
      } catch {
        // Skip corrupt file
      }
    }

    return chains;
  }

  /**
   * Check if a chain exists.
   */
  exists(id: string): boolean {
    return existsSync(this.filePath(id));
  }

  // ─── PRIVATE ────────────────────────────────────────────────

  private filePath(id: string): string {
    return join(this.chainsDir, `${id}.json`);
  }

  private writeToDisk(chain: Chain): void {
    const json = JSON.stringify(chain, null, 2);
    writeFileSync(this.filePath(chain.id), json, "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.chainsDir)) {
      mkdirSync(this.chainsDir, { recursive: true });
    }
  }

  private nextId(): string {
    this.ensureDir();
    const files = readdirSync(this.chainsDir)
      .filter(f => f.startsWith("chain_") && f.endsWith(".json"));

    if (files.length === 0) return "chain_001";

    const numbers = files.map(f => {
      const match = f.match(/chain_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });

    const max = Math.max(...numbers);
    const next = max + 1;
    return `chain_${next.toString().padStart(3, "0")}`;
  }
}
