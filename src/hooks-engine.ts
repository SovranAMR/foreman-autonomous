/**
 * FOREMAN — Hooks Engine
 *
 * Lifecycle hooks for pipeline, tool, and file operations.
 * Extensible event system for custom behaviors.
 *
 * OpenClaw'dan alınan: Plugin hook runner concept
 * Foreman farkı: Pipeline-phase hooks, no plugin registry needed
 *
 * Hook Points:
 * - before_pipeline / after_pipeline
 * - before_phase / after_phase
 * - before_thought / after_thought
 * - before_tool_call / after_tool_call
 * - before_file_write / after_file_write
 * - before_command / after_command
 * - before_commit / after_commit
 * - on_error / on_block
 * - on_cost_alert
 */

// ─── TYPES ───────────────────────────────────────────────────

export type HookName =
  | "before_pipeline"
  | "after_pipeline"
  | "before_phase"
  | "after_phase"
  | "before_thought"
  | "after_thought"
  | "before_tool_call"
  | "after_tool_call"
  | "before_file_write"
  | "after_file_write"
  | "before_command"
  | "after_command"
  | "before_commit"
  | "after_commit"
  | "on_error"
  | "on_block"
  | "on_cost_alert";

export interface HookEvent {
  hookName: HookName;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface HookResult {
  /** If true, the operation is blocked/cancelled */
  block?: boolean;
  /** Reason for blocking */
  blockReason?: string;
  /** Modified data to pass forward */
  modifiedData?: Record<string, unknown>;
}

export type HookHandler = (event: HookEvent) => HookResult | Promise<HookResult> | void | Promise<void>;

export interface HookRegistration {
  name: string;
  hookName: HookName;
  handler: HookHandler;
  priority: number;
  /** If true, errors are caught and logged instead of thrown */
  catchErrors: boolean;
}

// ─── HOOKS ENGINE ────────────────────────────────────────────

export class HooksEngine {
  private hooks = new Map<HookName, HookRegistration[]>();
  private history: Array<{ hookName: HookName; name: string; durationMs: number; blocked: boolean }> = [];

  /**
   * Register a hook handler.
   */
  register(
    hookName: HookName,
    handler: HookHandler,
    options?: { name?: string; priority?: number; catchErrors?: boolean },
  ): () => void {
    const registration: HookRegistration = {
      name: options?.name ?? `hook_${Date.now()}`,
      hookName,
      handler,
      priority: options?.priority ?? 0,
      catchErrors: options?.catchErrors ?? true,
    };

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const list = this.hooks.get(hookName)!;
    list.push(registration);
    // Sort by priority (higher first)
    list.sort((a, b) => b.priority - a.priority);

    // Return unregister function
    return () => {
      const idx = list.indexOf(registration);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  /**
   * Run all hooks for a given hook point.
   * Returns combined result — if any hook blocks, the result blocks.
   */
  async run(hookName: HookName, data: Record<string, unknown> = {}): Promise<HookResult> {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) {
      return {};
    }

    let combinedResult: HookResult = {};
    let currentData = { ...data };

    for (const reg of handlers) {
      const start = Date.now();
      let blocked = false;

      try {
        const event: HookEvent = {
          hookName,
          timestamp: Date.now(),
          data: currentData,
        };

        const result = await reg.handler(event);

        if (result) {
          if (result.block) {
            combinedResult.block = true;
            combinedResult.blockReason = result.blockReason ?? `Blocked by ${reg.name}`;
            blocked = true;
          }

          if (result.modifiedData) {
            currentData = { ...currentData, ...result.modifiedData };
            combinedResult.modifiedData = currentData;
          }
        }
      } catch (err) {
        if (!reg.catchErrors) {
          throw err;
        }
        // Log but continue
        console.warn(`[hooks] Error in ${reg.name} for ${hookName}: ${err instanceof Error ? err.message : String(err)}`);
      }

      this.history.push({
        hookName,
        name: reg.name,
        durationMs: Date.now() - start,
        blocked,
      });

      // If blocked, stop processing further hooks
      if (blocked) break;
    }

    return combinedResult;
  }

  /**
   * Check if any hooks are registered for a given hook name.
   */
  hasHooks(hookName: HookName): boolean {
    const handlers = this.hooks.get(hookName);
    return (handlers?.length ?? 0) > 0;
  }

  /**
   * Get registered hook count.
   */
  getHookCount(hookName?: HookName): number {
    if (hookName) {
      return this.hooks.get(hookName)?.length ?? 0;
    }
    let total = 0;
    for (const handlers of this.hooks.values()) {
      total += handlers.length;
    }
    return total;
  }

  /**
   * Get hook execution history.
   */
  getHistory(): typeof this.history {
    return this.history;
  }

  /**
   * Clear all hooks.
   */
  clear(): void {
    this.hooks.clear();
    this.history = [];
  }
}

// ─── BUILT-IN HOOKS ──────────────────────────────────────────

/**
 * Create a file size guard hook.
 * Blocks writes to files that would exceed maxSize bytes.
 */
export function createFileSizeGuard(maxSizeBytes: number): HookHandler {
  return (event) => {
    const content = event.data.content as string | undefined;
    if (content && Buffer.byteLength(content, "utf-8") > maxSizeBytes) {
      return {
        block: true,
        blockReason: `File too large: ${Buffer.byteLength(content, "utf-8")} bytes (max: ${maxSizeBytes})`,
      };
    }
  };
}

/**
 * Create a path guard hook.
 * Blocks writes outside allowed directories.
 */
export function createPathGuard(allowedPaths: string[]): HookHandler {
  return (event) => {
    const path = event.data.path as string | undefined;
    if (path && !allowedPaths.some(allowed => path.startsWith(allowed))) {
      return {
        block: true,
        blockReason: `Write blocked: ${path} is outside allowed directories`,
      };
    }
  };
}

/**
 * Create a command blocklist hook.
 */
export function createCommandBlocklist(patterns: RegExp[]): HookHandler {
  return (event) => {
    const command = event.data.command as string | undefined;
    if (command) {
      const blocked = patterns.find(p => p.test(command));
      if (blocked) {
        return {
          block: true,
          blockReason: `Command blocked: matches blocklist pattern ${blocked.source}`,
        };
      }
    }
  };
}

/**
 * Create a logging hook — logs all events to a callback.
 */
export function createLoggingHook(log: (message: string) => void): HookHandler {
  return (event) => {
    const detail = event.data.description ?? event.data.path ?? event.data.command ?? "";
    log(`[hook:${event.hookName}] ${detail}`);
  };
}
