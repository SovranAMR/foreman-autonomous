/**
 * FOREMAN — State Machine
 *
 * Foreman's discipline mechanism.
 * Every state change goes through this class.
 * Invalid transitions are REJECTED.
 * Every transition is logged (audit trail).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  SystemState,
  ForemanState,
  StateTransition,
} from "./types.js";
import { VALID_TRANSITIONS } from "./types.js";

// ─── ERRORS ───────────────────────────────────────────────────

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: SystemState,
    public readonly to: SystemState,
  ) {
    const validTargets = VALID_TRANSITIONS[from].join(", ");
    super(
      `Invalid state transition: "${from}" → "${to}". ` +
      `Valid targets from "${from}": [${validTargets}]`
    );
    this.name = "InvalidTransitionError";
  }
}

export class MissingReasonError extends Error {
  constructor() {
    super("State transition requires a reason. Empty string not allowed.");
    this.name = "MissingReasonError";
  }
}

export class CorruptedStateError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(
      `State file corrupted or unreadable: ${filePath}. ` +
      `Delete it manually to start fresh, or fix the JSON.`
    );
    this.name = "CorruptedStateError";
    this.cause = cause;
  }
}

// ─── STATE MANAGER ────────────────────────────────────────────

/** Max transition records — prevents memory overflow */
const MAX_HISTORY = 200;

export class StateManager {
  private state: ForemanState;
  private autoPersist: boolean;

  /**
   * Create with an existing ForemanState (resume)
   * or use StateManager.create() for fresh state.
   *
   * @param autoPersist - if true, auto save() after each transition()
   */
  constructor(state: ForemanState, autoPersist: boolean = true) {
    this.state = { ...state };
    this.autoPersist = autoPersist;
  }

  /**
   * Create fresh state for a new project.
   */
  static create(projectRoot: string, projectName: string, autoPersist: boolean = true): StateManager {
    const now = new Date().toISOString();
    return new StateManager({
      currentState: "idle",
      projectRoot,
      projectName,
      history: [],
      totalTokens: 0,
      sessionStartedAt: now,
      lastUpdatedAt: now,
    }, autoPersist);
  }

  /**
   * Read from state.json and return StateManager.
   * Returns null if file doesn't exist (fresh create needed).
   *
   * @throws CorruptedStateError - dosya var ama parse edilemiyor
   */
  static load(projectRoot: string, autoPersist: boolean = true): StateManager | null {
    const filePath = join(projectRoot, "state.json");
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as ForemanState;
      const sm = new StateManager(data, autoPersist);

      // AUTO-HEAL: If active chain is missing on disk, gracefully downgrade state to prevent engine lock
      if (data.activeChainId) {
        const chainPath = join(projectRoot, "chains", `${data.activeChainId}.json`);
        if (!existsSync(chainPath)) {
          sm.state.activeChainId = undefined;
          sm.state.activeThoughtId = undefined;
          
          if (sm.state.currentState === "executing" || sm.state.currentState === "verifying") {
             // Downgrade to an idle state so it doesn't try to resume a ghost chain
             sm.state.currentState = "idle";
          }
          
          if (autoPersist) {
            sm.save();
          }
        }
      }

      return sm;
    } catch (err) {
      throw new CorruptedStateError(filePath, err);
    }
  }

  /**
   * Return current system state.
   */
  current(): SystemState {
    return this.state.currentState;
  }

  /**
   * Return full state snapshot (readonly).
   */
  snapshot(): Readonly<ForemanState> {
    return { ...this.state };
  }

  /**
   * Check if this transition is valid.
   */
  canTransition(to: SystemState): boolean {
    const validTargets = VALID_TRANSITIONS[this.state.currentState];
    return validTargets.includes(to);
  }

  /**
   * Perform state transition.
   *
   * @param to - hedef state
   * @param reason - REQUIRED transition reason
   * @param context - opsiyonel thought/chain bilgisi
   * @throws InvalidTransitionError - invalid transition
   * @throws MissingReasonError - sebep yok
   * @returns yeni state
   */
  transition(
    to: SystemState,
    reason: string,
    context?: { thoughtId?: string; chainId?: string },
  ): SystemState {
    // Reason zorunlu
    if (!reason || reason.trim().length === 0) {
      throw new MissingReasonError();
    }

    // Is transition valid
    if (!this.canTransition(to)) {
      throw new InvalidTransitionError(this.state.currentState, to);
    }

    // Create transition record
    const transition: StateTransition = {
      from: this.state.currentState,
      to,
      reason: reason.trim(),
      at: new Date().toISOString(),
      thoughtId: context?.thoughtId,
      chainId: context?.chainId,
    };

    // Update state
    this.state.currentState = to;
    this.state.lastUpdatedAt = transition.at;

    // Update active chain/thought
    if (context?.chainId !== undefined) {
      this.state.activeChainId = context.chainId;
    }
    if (context?.thoughtId !== undefined) {
      this.state.activeThoughtId = context.thoughtId;
    }

    // Complete veya idle'da active'leri temizle
    if (to === "complete" || to === "idle") {
      this.state.activeChainId = undefined;
      this.state.activeThoughtId = undefined;
    }

    // Add to history (limit to max)
    this.state.history.push(transition);
    if (this.state.history.length > MAX_HISTORY) {
      this.state.history = this.state.history.slice(-MAX_HISTORY);
    }

    // Auto-persist
    if (this.autoPersist) {
      this.save();
    }

    return to;
  }

  /**
   * Add token usage (rate limit budget tracking).
   */
  addTokens(count: number): void {
    this.state.totalTokens += count;
  }

  /**
   * Return last N transitions.
   */
  recentHistory(n: number = 10): readonly StateTransition[] {
    return this.state.history.slice(-n);
  }

  // ─── RECOVERY QUEUE (Katman 3) ────────────────────────────

  /**
   * Push a failed atom onto the recovery queue. Deduped by (blockIndex,
   * atomIndex, stage) so repeated rescue attempts don't bloat the queue.
   */
  pushRecovery(failed: import("./types.js").FailedAtom): void {
    const queue = this.state.recoveryQueue ?? [];
    const dup = queue.some(
      (q) => q.blockIndex === failed.blockIndex
        && q.atomIndex === failed.atomIndex
        && q.stage === failed.stage,
    );
    if (dup) return;
    queue.push(failed);
    this.state.recoveryQueue = queue;
    if (this.autoPersist) this.save();
  }

  /**
   * Return the current recovery queue (empty array if none).
   */
  getRecoveryQueue(): readonly import("./types.js").FailedAtom[] {
    return this.state.recoveryQueue ?? [];
  }

  /**
   * Wipe the recovery queue — called after the RECOVERY phase
   * successfully resolves all outstanding items.
   */
  clearRecoveryQueue(): void {
    this.state.recoveryQueue = [];
    if (this.autoPersist) this.save();
  }

  // ─── PERSISTENCE ──────────────────────────────────────────

  /**
   * State'i state.json'a yaz.
   * projectRoot/state.json konumuna kaydeder.
   */
  save(): void {
    const filePath = join(this.state.projectRoot, "state.json");
    const json = JSON.stringify(this.state, null, 2);
    writeFileSync(filePath, json, "utf-8");
  }

  /**
   * Return path to state.json file.
   */
  get stateFilePath(): string {
    return join(this.state.projectRoot, "state.json");
  }
}
