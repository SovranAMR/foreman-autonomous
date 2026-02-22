/**
 * FOREMAN — File Watcher Engine
 *
 * Watch project files for changes and trigger actions.
 * Integrates with TaskScheduler for debounced re-execution.
 *
 * Capabilities:
 * - Watch directories for file changes (add/modify/delete)
 * - Debounced triggers (coalesce rapid saves)
 * - Pattern-based filtering (include/exclude globs)
 * - Event callbacks for change detection
 * - Integration with pipeline re-run
 * - Auto-test on file save
 * - Auto-lint on file save
 */

import { watch, type FSWatcher } from "node:fs";
import { join, relative, extname } from "node:path";
import { readdirSync, statSync, existsSync } from "node:fs";
import { EventEmitter } from "node:events";

// ─── TYPES ───────────────────────────────────────────────────

export interface FileChangeEvent {
  type: "add" | "modify" | "delete";
  path: string;
  relativePath: string;
  timestamp: number;
}

export interface WatchConfig {
  /** Directories to watch (default: ["src"]) */
  paths: string[];
  /** File extensions to watch (default: common code extensions) */
  extensions: string[];
  /** Directories to ignore */
  ignore: string[];
  /** Debounce delay in ms (default: 500) */
  debounceMs: number;
  /** Whether to watch recursively (default: true) */
  recursive: boolean;
}

export type ChangeHandler = (events: FileChangeEvent[]) => void | Promise<void>;

const DEFAULT_CONFIG: WatchConfig = {
  paths: ["src"],
  extensions: [".ts", ".js", ".tsx", ".jsx", ".json", ".md", ".css", ".html", ".py", ".rs", ".go"],
  ignore: ["node_modules", ".git", "dist", "build", ".foreman", "__pycache__", ".next"],
  debounceMs: 500,
  recursive: true,
};

// ─── FILE WATCHER ENGINE ─────────────────────────────────────

export class FileWatcher extends EventEmitter {
  private watchers: FSWatcher[] = [];
  private config: WatchConfig;
  private projectRoot: string;
  private pendingEvents: FileChangeEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: ChangeHandler[] = [];
  private running = false;
  private changeCount = 0;

  constructor(projectRoot: string, config?: Partial<WatchConfig>) {
    super();
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a change handler.
   * Called with batched events after debounce delay.
   */
  onChanges(handler: ChangeHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Start watching for file changes.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const watchPath of this.config.paths) {
      const fullPath = join(this.projectRoot, watchPath);
      if (!existsSync(fullPath)) continue;

      try {
        const watcher = watch(fullPath, { recursive: this.config.recursive }, (eventType, filename) => {
          if (!filename) return;

          const relativePath = join(watchPath, filename);
          const ext = extname(filename);

          // Filter by extension
          if (this.config.extensions.length > 0 && !this.config.extensions.includes(ext)) return;

          // Filter by ignore patterns
          if (this.config.ignore.some(ig => relativePath.includes(ig))) return;

          const event: FileChangeEvent = {
            type: eventType === "rename" ? "add" : "modify",
            path: join(this.projectRoot, relativePath),
            relativePath,
            timestamp: Date.now(),
          };

          this.pendingEvents.push(event);
          this.changeCount++;
          this.scheduleBatch();
        });

        this.watchers.push(watcher);
      } catch (err) {
        console.warn(`[watcher] Failed to watch ${fullPath}:`, err);
      }
    }

    this.emit("started", { paths: this.config.paths });
  }

  /**
   * Stop watching.
   */
  stop(): void {
    this.running = false;

    for (const watcher of this.watchers) {
      try { watcher.close(); } catch { /* ignore */ }
    }
    this.watchers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.emit("stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getChangeCount(): number {
    return this.changeCount;
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private scheduleBatch(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const events = this.deduplicateEvents(this.pendingEvents);
      this.pendingEvents = [];

      if (events.length === 0) return;

      this.emit("changes", events);

      for (const handler of this.handlers) {
        try {
          await handler(events);
        } catch (err) {
          this.emit("error", err);
        }
      }
    }, this.config.debounceMs);
    this.debounceTimer.unref();
  }

  private deduplicateEvents(events: FileChangeEvent[]): FileChangeEvent[] {
    const seen = new Map<string, FileChangeEvent>();
    for (const event of events) {
      const existing = seen.get(event.path);
      if (!existing || event.timestamp > existing.timestamp) {
        seen.set(event.path, event);
      }
    }
    return [...seen.values()];
  }
}

// ─── AUTO-TRIGGERS ───────────────────────────────────────────

/**
 * Create an auto-test trigger.
 * Runs `npm test` (or custom command) when source files change.
 */
export function createAutoTestTrigger(
  testCommand = "npm test",
  extensions = [".ts", ".js", ".tsx", ".jsx"],
): ChangeHandler {
  let running = false;

  return async (events) => {
    if (running) return;
    const hasTestable = events.some(e => extensions.some(ext => e.path.endsWith(ext)));
    if (!hasTestable) return;

    running = true;
    try {
      const { execSync } = await import("node:child_process");
      const output = execSync(testCommand, {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
        stdio: "pipe",
      });
      console.log(`[auto-test] ✔ Tests passed`);
    } catch (err: unknown) {
      const e = err as { stderr?: string };
      console.log(`[auto-test] ✖ Tests failed: ${(e.stderr ?? "").slice(0, 200)}`);
    } finally {
      running = false;
    }
  };
}

/**
 * Create an auto-lint trigger.
 * Runs linter when source files change.
 */
export function createAutoLintTrigger(
  lintCommand = "npx eslint --fix",
): ChangeHandler {
  return async (events) => {
    const files = events
      .filter(e => e.type !== "delete" && /\.(ts|js|tsx|jsx)$/.test(e.path))
      .map(e => e.path);

    if (files.length === 0) return;

    try {
      const { execSync } = await import("node:child_process");
      execSync(`${lintCommand} ${files.join(" ")}`, {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });
    } catch {
      // Lint errors are informational, not blocking
    }
  };
}

/**
 * Scan a directory tree and return all matching files.
 * Useful for initial indexing before watching.
 */
export function scanDirectory(
  rootDir: string,
  extensions: string[] = DEFAULT_CONFIG.extensions,
  ignore: string[] = DEFAULT_CONFIG.ignore,
): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const rel = relative(rootDir, fullPath);

        if (ignore.some(ig => rel.includes(ig))) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (extensions.length === 0 || extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch { /* permission errors etc */ }
  }

  walk(rootDir);
  return results;
}
