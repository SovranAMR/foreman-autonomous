/**
 * FOREMAN — Execution Engine
 *
 * Enables the worker layer to do real-world work:
 * - File read / write / edit / delete (with security)
 * - Shell command execution (sync + async with timeout/kill)
 * - Git operations (commit, diff, branch, status)
 * - Project structure discovery
 *
 * Transplant from OpenClaw:
 *   - Async spawn with timeout + SIGKILL cleanup
 *   - Line-range file reading
 *   - Smart output truncation (middle-cut)
 *   - Enhanced dangerous command blocklist
 *   - Detailed git operations
 *
 * Translates STEP6_EXECUTE instructions from the worker LLM
 * into real file operations through this engine.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { ProcessRegistry, createSessionId } from "./process-registry.js";
import type { ApprovalEngine } from "./approval-engine.js";
import type { CommandQueue } from "./command-queue.js";
import type { Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface FileOperation {
  type: "read" | "write" | "edit" | "create" | "delete";
  path: string;
  content?: string;
  /** edit: old text → new text */
  oldText?: string;
  newText?: string;
  /** read: optional line range */
  startLine?: number;
  endLine?: number;
}

export interface FileResult {
  success: boolean;
  path: string;
  content?: string;
  error?: string;
  /** read: how many lines total */
  totalLines?: number;
}

export interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Whether the process was killed due to timeout */
  timedOut?: boolean;
  /** Duration in ms */
  durationMs?: number;
}

export interface AsyncShellHandle {
  /** Process ID */
  pid: number | undefined;
  /** Promise that resolves when process exits */
  promise: Promise<ShellResult>;
  /** Kill the process */
  kill: (signal?: NodeJS.Signals) => void;
  /** Write to stdin */
  writeStdin: (data: string) => void;
  /** Close stdin */
  closeStdin: () => void;
}

export interface ProjectTree {
  files: string[];
  dirs: string[];
  total: number;
}

export interface GitStatus {
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitDiffResult {
  success: boolean;
  stat: string;
  patch?: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

// ─── CONSTANTS ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 1024 * 1024; // 1MB
const DEFAULT_MAX_OUTPUT = 15_000;
/** Max output bytes to accumulate in memory before truncating */
const MAX_OUTPUT_ACCUMULATE = 512 * 1024; // 512KB

/**
 * Environment variables that could inject code or alter execution flow.
 * Blocked when passed via the env option to prevent LLM hallucination attacks.
 *
 * Transplanted from OpenClaw bash-tools.exec.ts and EXPANDED:
 * OpenClaw blocks these only on non-sandbox hosts.
 * Foreman blocks them always — defense in depth for coding agents.
 */
const DANGEROUS_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PYTHONPATH",
  "PYTHONHOME",
  "RUBYLIB",
  "PERL5LIB",
  "BASH_ENV",
  "ENV",
  "GCONV_PATH",
  "IFS",
  "SSLKEYLOGFILE",
]);

/** Prefix-based env var blocking (catches DYLD_*, LD_*) */
const DANGEROUS_ENV_PREFIXES = ["DYLD_", "LD_"];

/**
 * Dangerous command patterns — blocked before execution.
 * More comprehensive than the original list.
 * Transplanted and expanded from OpenClaw's security patterns.
 */
const DANGEROUS_PATTERNS = [
  "rm -rf /",
  "rm -rf /*",
  "chmod 777 /",
  "mkfs.",
  "> /dev/sda",
  "dd if=/dev/zero of=/dev/sd",
  ":(){ :|:& };:",  // fork bomb
  "echo '' > /etc/",
  "> /etc/passwd",
  "> /etc/shadow",
  "chmod 000 /",
  "chown -R",
  "mv / ",
  "shutdown",
  "reboot",
  "init 0",
  "init 6",
];

/**
 * Regex patterns for commands that pipe fetched content into a shell.
 * These catch `curl <url> | sh`, `wget <url> | bash`, etc.
 */
const DANGEROUS_PIPE_RX = [
  /curl\s.*\|\s*(?:sh|bash|zsh)/i,
  /wget\s.*\|\s*(?:sh|bash|zsh)/i,
  /python[3]?\s+-c\s+['"].*urllib.*exec/i, // Python download-and-exec
  /eval\s*\$\(curl/i, // eval $(curl ...)
];

/**
 * Commands that require explicit sudo — blocked on non-elevated runs.
 */
const SUDO_PATTERNS = ["sudo ", "su -c", "doas "];

// ─── EXECUTION ENGINE ────────────────────────────────────────

export class ExecutionEngine {
  private projectRoot: string;
  /** File patterns with write permission (security) */
  private allowedPaths: string[];
  /** Denied file patterns */
  private deniedPaths: string[] = [
    "node_modules",
    ".git/objects",
    ".git/refs",
    ".env",
    ".env.local",
    ".env.production",
    ".env.staging",
    "*.key",
    "*.pem",
    "*.p12",
    "*.pfx",
    "id_rsa",
    "id_ed25519",
  ];
  /** Active async processes */
  private activeProcesses = new Map<string, AsyncShellHandle>();

  /** Process registry for lifecycle tracking */
  private registry: ProcessRegistry | null = null;

  /** Approval engine for command risk assessment */
  private approvalEngine: ApprovalEngine | null = null;

  /** Command queue for async serialization */
  private commandQueue: CommandQueue | null = null;

  constructor(projectRoot: string, allowedPaths?: string[]) {
    this.projectRoot = projectRoot;
    this.allowedPaths = allowedPaths ?? [
      "src", "public", "components", "lib", "app", "pages",
      "styles", "test", "tests", "__tests__", "scripts", "docs",
    ];
  }

  /**
   * Connect a ProcessRegistry for lifecycle tracking of async processes.
   * When connected, runShellAsync automatically registers sessions.
   */
  connectRegistry(registry: ProcessRegistry): void {
    this.registry = registry;
  }

  /**
   * Connect an ApprovalEngine for command risk assessment.
   * When connected, runShell checks risk before execution.
   */
  connectApproval(approval: ApprovalEngine): void {
    this.approvalEngine = approval;
  }

  /**
   * Connect a CommandQueue for async command serialization.
   * When connected, runShellAsync routes through the queue.
   */
  connectQueue(queue: CommandQueue): void {
    this.commandQueue = queue;
  }

  // ─── PATH SECURITY ──────────────────────────────────────

  /**
   * Path security check — prevent escaping outside projectRoot.
   */
  private securePath(filePath: string): string {
    // Null byte injection protection
    if (filePath.includes("\0")) {
      throw new Error(`Path contains null byte: rejected`);
    }

    const resolved = filePath.startsWith("/")
      ? filePath
      : join(this.projectRoot, filePath);

    const rel = relative(this.projectRoot, resolved);
    if (rel.startsWith("..") || rel.startsWith("/")) {
      throw new Error(`Path traversal denied: ${filePath} resolves outside project root`);
    }

    for (const denied of this.deniedPaths) {
      if (denied.startsWith("*")) {
        if (resolved.endsWith(denied.slice(1))) {
          throw new Error(`Access denied: ${filePath} matches denied pattern ${denied}`);
        }
      } else if (rel.includes(denied)) {
        throw new Error(`Access denied: ${filePath} is in denied path ${denied}`);
      }
    }

    return resolved;
  }

  // ─── FILE OPERATIONS ─────────────────────────────────────

  /**
   * Read file — supports optional line range.
   * Transplanted from OpenClaw tools.ts: line-range reading with line numbers.
   */
  readFile(filePath: string, startLine?: number, endLine?: number): FileResult {
    try {
      const resolved = this.securePath(filePath);
      if (!existsSync(resolved)) {
        return { success: false, path: filePath, error: `File not found: ${filePath}` };
      }
      let content = readFileSync(resolved, "utf-8");
      const totalLines = content.split("\n").length;

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split("\n");
        const start = Math.max(1, startLine ?? 1) - 1;
        const end = Math.min(lines.length, endLine ?? lines.length);
        content = lines
          .slice(start, end)
          .map((l, i) => `${start + i + 1}: ${l}`)
          .join("\n");
      }

      return { success: true, path: filePath, content, totalLines };
    } catch (err: any) {
      return { success: false, path: filePath, error: err.message };
    }
  }

  /**
   * Write file (create or overwrite).
   */
  writeFile(filePath: string, content: string): FileResult {
    try {
      const resolved = this.securePath(filePath);
      const dir = dirname(resolved);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(resolved, content, "utf-8");
      return { success: true, path: filePath };
    } catch (err: any) {
      return { success: false, path: filePath, error: err.message };
    }
  }

  /**
   * Replace text in file (exact match).
   */
  editFile(filePath: string, oldText: string, newText: string): FileResult {
    try {
      const resolved = this.securePath(filePath);
      if (!existsSync(resolved)) {
        return { success: false, path: filePath, error: `File not found: ${filePath}` };
      }
      const content = readFileSync(resolved, "utf-8");
      if (!content.includes(oldText)) {
        return { success: false, path: filePath, error: `Old text not found in file` };
      }
      const newContent = content.replace(oldText, newText);
      writeFileSync(resolved, newContent, "utf-8");
      return { success: true, path: filePath };
    } catch (err: any) {
      return { success: false, path: filePath, error: err.message };
    }
  }

  /**
   * Delete file.
   */
  deleteFile(filePath: string): FileResult {
    try {
      const resolved = this.securePath(filePath);
      if (!existsSync(resolved)) {
        return { success: true, path: filePath }; // already gone
      }
      unlinkSync(resolved);
      return { success: true, path: filePath };
    } catch (err: any) {
      return { success: false, path: filePath, error: err.message };
    }
  }

  /**
   * Batch file operations.
   */
  executeOperations(ops: FileOperation[]): FileResult[] {
    return ops.map((op) => {
      switch (op.type) {
        case "read":
          return this.readFile(op.path, op.startLine, op.endLine);
        case "write":
        case "create":
          return this.writeFile(op.path, op.content ?? "");
        case "edit":
          return this.editFile(op.path, op.oldText ?? "", op.newText ?? "");
        case "delete":
          return this.deleteFile(op.path);
        default:
          return { success: false, path: op.path, error: `Unknown operation: ${op.type}` };
      }
    });
  }

  // ─── SHELL COMMANDS (SYNC) ───────────────────────────────

  /**
   * Run shell command synchronously.
   * For quick commands (< 60s).
   */
  runShell(command: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): ShellResult {
    if (this.isDangerous(command)) {
      return {
        success: false,
        stdout: "",
        stderr: `Dangerous command blocked: ${command}`,
        exitCode: -1,
      };
    }

    // Approval engine risk check — deny high-risk commands
    if (this.approvalEngine) {
      const assessment = this.approvalEngine.assess(command, "worker");
      if (assessment.decision === "deny") {
        return {
          success: false,
          stdout: "",
          stderr: `Command denied by approval engine: ${assessment.reason} (risk: ${(assessment.riskScore * 100).toFixed(0)}%)`,
          exitCode: -1,
        };
      }
      // Record successful execution for allowlist learning
      if (assessment.decision === "allow") {
        // Will record success after execution via recordSuccess below
      }
    }

    const start = Date.now();
    try {
      const stdout = execSync(command, {
        cwd: this.projectRoot,
        timeout: timeoutMs,
        encoding: "utf-8",
        maxBuffer: DEFAULT_MAX_BUFFER,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Record success for allowlist learning
      if (this.approvalEngine) {
        this.approvalEngine.reportSuccess(command);
      }

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: "",
        exitCode: 0,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      // Record failure for allowlist demotion
      if (this.approvalEngine) {
        this.approvalEngine.reportFailure(command);
      }

      return {
        success: false,
        stdout: err.stdout?.toString().trim() ?? "",
        stderr: err.stderr?.toString().trim() ?? err.message,
        exitCode: err.status ?? 1,
        timedOut: err.killed === true,
        durationMs: Date.now() - start,
      };
    }
  }

  // ─── SHELL COMMANDS (ASYNC) ──────────────────────────────

  /**
   * Run shell command asynchronously with timeout and kill.
   *
   * Transplanted from OpenClaw's exec infrastructure.
   *
   * Features:
   *   - Non-blocking execution (doesn't freeze the pipeline)
   *   - Configurable timeout with SIGTERM → SIGKILL escalation
   *   - Output aggregation (stdout + stderr)
   *   - Stdin writing for interactive commands
   *   - Process tracking (list/kill active processes)
   *
   * Use for: npm install, build, test suites, any long-running command.
   */
  runShellAsync(
    command: string,
    options: {
      timeoutMs?: number;
      env?: Record<string, string>;
      cwd?: string;
    } = {},
  ): AsyncShellHandle {
    if (this.isDangerous(command)) {
      // Return an immediately-resolved handle for blocked commands
      const result: ShellResult = {
        success: false,
        stdout: "",
        stderr: `Dangerous command blocked: ${command}`,
        exitCode: -1,
      };
      return {
        pid: undefined,
        promise: Promise.resolve(result),
        kill: () => {},
        writeStdin: () => {},
        closeStdin: () => {},
      };
    }

    // Approval engine risk check
    if (this.approvalEngine) {
      const assessment = this.approvalEngine.assess(command, "worker");
      if (assessment.decision === "deny") {
        return {
          pid: undefined,
          promise: Promise.resolve({
            success: false,
            stdout: "",
            stderr: `Command denied by approval engine: ${assessment.reason} (risk: ${(assessment.riskScore * 100).toFixed(0)}%)`,
            exitCode: -1,
          }),
          kill: () => {},
          writeStdin: () => {},
          closeStdin: () => {},
        };
      }
    }

    // Validate env vars — block LD_PRELOAD, NODE_OPTIONS, PATH etc.
    if (options.env) {
      const envError = validateEnv(options.env);
      if (envError) {
        return {
          pid: undefined,
          promise: Promise.resolve({
            success: false,
            stdout: "",
            stderr: envError,
            exitCode: -1,
          }),
          kill: () => {},
          writeStdin: () => {},
          closeStdin: () => {},
        };
      }
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let killed = false;

    // detached: true → child gets its own process group.
    // For simple commands, 'exec' replaces bash with the command,
    // preventing orphaned grandchildren.
    // For compound commands (pipes, redirects, &&, ||), exec won't work,
    // so we skip it.
    const isCompound = /[|&;<>()]/.test(command);
    const firstWord = command.trim().split(/\s+/)[0];
    const BUILTINS = new Set([
      "exit", "cd", "source", ".", "eval", "export", "unset", "set",
      "read", "echo", "printf", "test", "[", "true", "false", "return",
      "shift", "wait", "trap", "umask", "ulimit", "builtin", "command",
      "declare", "local", "typeset", "readonly", "let", "exec",
    ]);
    const useExec = !isCompound && !BUILTINS.has(firstWord);
    const shellCmd = useExec ? `exec ${command}` : command;
    const child: ChildProcess = spawn("bash", ["-c", shellCmd], {
      cwd: options.cwd ?? this.projectRoot,
      env: { ...process.env, ...options.env, PAGER: "cat" },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });

    /**
     * Kill the entire process group.
     * -pid kills bash + all its children (sleep, node, etc.)
     */
    const killChild = (signal: NodeJS.Signals) => {
      if (child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch {
          try { child.kill(signal); } catch { /* dead */ }
        }
      }
    };

    // Timeout → SIGTERM, then SIGKILL after 3s
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        killChild("SIGTERM");

        // Escalate to SIGKILL after 3 seconds
        killTimer = setTimeout(() => {
          killChild("SIGKILL");
        }, 3000);
        // Don't let the escalation timer keep the process alive
        if (killTimer && typeof killTimer === "object" && "unref" in killTimer) {
          (killTimer as NodeJS.Timeout).unref();
        }
      }, timeoutMs);
      // Don't let the timeout timer keep the process alive
      if (timeoutTimer && typeof timeoutTimer === "object" && "unref" in timeoutTimer) {
        (timeoutTimer as NodeJS.Timeout).unref();
      }
    }

    // ── Registry: register session if connected ──
    const sessionId = createSessionId();
    if (this.registry) {
      this.registry.register({
        id: sessionId,
        command,
        pid: child.pid,
        cwd: options.cwd ?? this.projectRoot,
      });
    }

    child.stdout?.on("data", (data) => {
      const chunk = sanitizeBinaryOutput(data.toString());
      // Guard against unbounded memory growth
      if (outputBytes < MAX_OUTPUT_ACCUMULATE) {
        stdout += chunk;
        outputBytes += chunk.length;
      }
      // Stream to registry
      if (this.registry) {
        this.registry.appendOutput(sessionId, "stdout", chunk);
      }
    });

    child.stderr?.on("data", (data) => {
      const chunk = sanitizeBinaryOutput(data.toString());
      if (outputBytes < MAX_OUTPUT_ACCUMULATE) {
        stderr += chunk;
        outputBytes += chunk.length;
      }
      // Stream to registry
      if (this.registry) {
        this.registry.appendOutput(sessionId, "stderr", chunk);
      }
    });

    const promise = new Promise<ShellResult>((resolve) => {
      // 'close' fires after all stdio streams are closed —
      // this is the reliable event for "process fully done".
      child.on("close", (code, _signal) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);

        // Kill entire process group to clean up orphaned grandchildren
        if (child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { /* already dead */ }
        }

        const durationMs = Date.now() - startedAt;
        const success = code === 0 && !timedOut;

        // ── Registry: mark exited ──
        if (this.registry) {
          this.registry.markExited(
            sessionId,
            code ?? null,
            _signal ?? null,
            timedOut ? "timeout" : (killed ? "killed" : undefined),
          );
        }

        // ── Approval learning ──
        if (this.approvalEngine) {
          if (success) {
            this.approvalEngine.reportSuccess(command);
          } else {
            this.approvalEngine.reportFailure(command);
          }
        }

        resolve({
          success,
          stdout: truncateMiddle(stdout.trim(), DEFAULT_MAX_OUTPUT),
          stderr: truncateMiddle(stderr.trim(), DEFAULT_MAX_OUTPUT),
          exitCode: code ?? (timedOut ? -1 : 1),
          timedOut,
          durationMs,
        });
      });

      child.on("error", (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);

        resolve({
          success: false,
          stdout: truncateMiddle(stdout.trim(), DEFAULT_MAX_OUTPUT),
          stderr: err.message,
          exitCode: -1,
          durationMs: Date.now() - startedAt,
        });
      });
    });

    const handle: AsyncShellHandle = {
      pid: child.pid,
      promise,
      kill: (signal: NodeJS.Signals = "SIGTERM") => {
        if (!killed) {
          killed = true;
          killChild(signal);
        }
      },
      writeStdin: (data: string) => {
        try {
          child.stdin?.write(data);
        } catch { /* ignore */ }
      },
      closeStdin: () => {
        try {
          child.stdin?.end();
        } catch { /* ignore */ }
      },
    };

    this.activeProcesses.set(sessionId, handle);

    // Auto-cleanup when process exits
    promise.then(() => {
      this.activeProcesses.delete(sessionId);
    });

    // If CommandQueue connected, wrap the promise through the queue
    // This serializes async commands to prevent resource contention
    if (this.commandQueue) {
      const queuedPromise = this.commandQueue.enqueue({
        execute: () => promise,
        lane: "shell",
        priority: "normal",
      });
      // Replace the handle's promise with the queued version
      handle.promise = queuedPromise;
    }

    return handle;
  }

  /**
   * List active async processes.
   */
  listProcesses(): Array<{ id: string; pid: number | undefined }> {
    return Array.from(this.activeProcesses.entries()).map(([id, handle]) => ({
      id,
      pid: handle.pid,
    }));
  }

  /**
   * Kill all active async processes.
   */
  killAllProcesses(): void {
    for (const [, handle] of this.activeProcesses) {
      handle.kill("SIGTERM");
    }
  }

  // ─── COMMAND SECURITY ────────────────────────────────────

  /**
   * Check if a command is dangerous.
   */
  private isDangerous(command: string): boolean {
    const lower = command.toLowerCase();
    for (const pattern of DANGEROUS_PATTERNS) {
      if (lower.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    for (const rx of DANGEROUS_PIPE_RX) {
      if (rx.test(command)) {
        return true;
      }
    }
    for (const pattern of SUDO_PATTERNS) {
      if (lower.startsWith(pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  // ─── PROJECT DISCOVERY ───────────────────────────────────

  /**
   * Discover project structure (file tree).
   */
  discoverProject(maxDepth: number = 3): ProjectTree {
    const files: string[] = [];
    const dirs: string[] = [];

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === ".next") continue;

          const fullPath = join(dir, entry);
          const relPath = relative(this.projectRoot, fullPath);

          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              dirs.push(relPath);
              walk(fullPath, depth + 1);
            } else {
              files.push(relPath);
            }
          } catch { /* permission denied */ }
        }
      } catch { /* dir read error */ }
    };

    walk(this.projectRoot, 0);
    return { files, dirs, total: files.length + dirs.length };
  }

  /**
   * Search for pattern in project files (grep).
   */
  searchInFiles(
    pattern: string,
    glob: string = "src/**/*.ts",
  ): Array<{ file: string; line: number; text: string }> {
    try {
      const result = this.runShell(
        `grep -rn "${pattern.replace(/"/g, '\\"')}" --include="${glob}" .`,
        10_000,
      );
      if (!result.success || !result.stdout) return [];

      return result.stdout
        .split("\n")
        .filter((l) => l.length > 0)
        .map((line) => {
          const match = line.match(/^\.\/(.+?):(\d+):(.*)/);
          if (!match) return null;
          return { file: match[1], line: parseInt(match[2]), text: match[3].trim() };
        })
        .filter((r): r is { file: string; line: number; text: string } => r !== null)
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  // ─── GIT OPERATIONS ──────────────────────────────────────

  /**
   * Git commit (stage + commit given files).
   */
  gitCommit(message: string, files?: string[]): ShellResult {
    if (files && files.length > 0) {
      const fileArgs = files.map((f) => `"${f}"`).join(" ");
      const addResult = this.runShell(`git add ${fileArgs}`);
      if (!addResult.success) return addResult;
    } else {
      const addResult = this.runShell("git add -A");
      if (!addResult.success) return addResult;
    }

    // Use -F - (read from stdin) for multi-line messages
    // This is more reliable than -m with shell escaping
    try {
      const result = execSync("git commit -F -", {
        cwd: this.projectRoot,
        input: message,
        timeout: 30_000,
        maxBuffer: DEFAULT_MAX_BUFFER,
        encoding: "utf-8",
      });
      return {
        success: true,
        stdout: result,
        stderr: "",
        exitCode: 0,
      };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      return {
        success: false,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? String(err),
        exitCode: e.status ?? 1,
      };
    }
  }

  /**
   * Git diff — detailed with stats.
   *
   * Transplanted from OpenClaw: returns structured diff info
   * for the worker's VERIFY step.
   */
  gitDiff(options?: { staged?: boolean; file?: string }): GitDiffResult {
    const args: string[] = ["git", "diff"];
    if (options?.staged) args.push("--staged");
    if (options?.file) args.push("--", options.file);

    // Get stat
    const stat = this.runShell([...args, "--stat"].join(" "));
    if (!stat.success && !stat.stdout) {
      return { success: false, stat: "", filesChanged: 0, insertions: 0, deletions: 0 };
    }

    // Get numstat for structured data
    const numstat = this.runShell([...args, "--numstat"].join(" "));
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    if (numstat.success && numstat.stdout) {
      const lines = numstat.stdout.split("\n").filter((l) => l.trim().length > 0);
      filesChanged = lines.length;
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          const ins = parseInt(parts[0]);
          const del = parseInt(parts[1]);
          if (!isNaN(ins)) insertions += ins;
          if (!isNaN(del)) deletions += del;
        }
      }
    }

    // Get patch (optional, for detailed review)
    const patch = this.runShell([...args].join(" "));

    return {
      success: true,
      stat: stat.stdout,
      patch: patch.success ? patch.stdout : undefined,
      filesChanged,
      insertions,
      deletions,
    };
  }

  /**
   * Git status — structured.
   */
  gitStatus(): GitStatus {
    const result: GitStatus = {
      branch: "unknown",
      clean: true,
      staged: [],
      unstaged: [],
      untracked: [],
      ahead: 0,
      behind: 0,
    };

    // Branch
    const branch = this.runShell("git branch --show-current");
    if (branch.success) {
      result.branch = branch.stdout.trim() || "HEAD";
    }

    // Status
    const status = this.runShell("git status --porcelain=v1");
    if (status.success && status.stdout) {
      const lines = status.stdout.split("\n").filter((l) => l.length >= 3);
      for (const line of lines) {
        const x = line[0]; // staged
        const y = line[1]; // unstaged
        const file = line.slice(3);

        if (x === "?" && y === "?") {
          result.untracked.push(file);
        } else {
          if (x !== " " && x !== "?") result.staged.push(file);
          if (y !== " " && y !== "?") result.unstaged.push(file);
        }
      }
      result.clean = lines.length === 0;
    }

    // Ahead/behind
    const revList = this.runShell("git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null");
    if (revList.success && revList.stdout) {
      const parts = revList.stdout.trim().split(/\s+/);
      if (parts.length === 2) {
        result.ahead = parseInt(parts[0]) || 0;
        result.behind = parseInt(parts[1]) || 0;
      }
    }

    return result;
  }

  /**
   * Git branch operations.
   */
  gitBranch(action: "list" | "create" | "checkout" | "delete", name?: string): ShellResult {
    switch (action) {
      case "list":
        return this.runShell("git branch -a");
      case "create":
        if (!name) return { success: false, stdout: "", stderr: "Branch name required", exitCode: 1 };
        return this.runShell(`git checkout -b "${name}"`);
      case "checkout":
        if (!name) return { success: false, stdout: "", stderr: "Branch name required", exitCode: 1 };
        return this.runShell(`git checkout "${name}"`);
      case "delete":
        if (!name) return { success: false, stdout: "", stderr: "Branch name required", exitCode: 1 };
        return this.runShell(`git branch -d "${name}"`);
      default:
        return { success: false, stdout: "", stderr: `Unknown action: ${action}`, exitCode: 1 };
    }
  }

  /**
   * Git log — recent commits.
   */
  gitLog(count: number = 10): ShellResult {
    return this.runShell(`git log --oneline -n ${count}`);
  }
}

// ─── UTILITY FUNCTIONS ───────────────────────────────────────

/**
 * Smart truncation — keeps beginning and end, cuts middle.
 * Shows where truncation happened.
 *
 * Transplanted from OpenClaw tools.ts.
 * This is better than simple slice because build/test output
 * has important info at both start (errors) and end (summary).
 */
export function truncateMiddle(text: string, maxLen: number = DEFAULT_MAX_OUTPUT): string {
  if (text.length <= maxLen) return text;
  const half = Math.floor(maxLen / 2) - 50;
  const truncatedCount = text.length - maxLen;
  return (
    text.slice(0, half) +
    `\n\n... [${truncatedCount} characters truncated] ...\n\n` +
    text.slice(-half)
  );
}

/**
 * Sanitize binary/control character output before feeding to LLM.
 *
 * Transplanted from OpenClaw shell-utils.ts and IMPROVED.
 * OpenClaw strips Format/Surrogate unicode categories + control chars < 0x20.
 * Foreman additionally strips ANSI escape sequences (color codes, cursor moves)
 * because they waste tokens and confuse cheap models.
 */
export function sanitizeBinaryOutput(text: string): string {
  // Strip ANSI escape sequences (CSI, OSC, etc.)
  let cleaned = text.replace(
    // biome-ignore lint: complex regex for ANSI stripping
    /\x1B(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|\][^\x1B]*\x1B\\|[()][AB012])/g,
    "",
  );

  // Strip unicode Format/Surrogate categories
  cleaned = cleaned.replace(/[\p{Format}\p{Surrogate}]/gu, "");

  // Strip control characters except tab, newline, carriage return
  const chunks: string[] = [];
  for (const char of cleaned) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    // Keep tab (0x09), newline (0x0a), carriage return (0x0d)
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      chunks.push(char);
      continue;
    }
    // Drop all other control chars
    if (code < 0x20) continue;
    chunks.push(char);
  }
  return chunks.join("");
}

/**
 * Validate environment variables — block dangerous injections.
 *
 * Transplanted from OpenClaw bash-tools.exec.ts validateHostEnv() and IMPROVED.
 * OpenClaw only validates on non-sandbox hosts.
 * Foreman validates ALWAYS — even a local coding agent shouldn't allow
 * LD_PRELOAD or NODE_OPTIONS injection from LLM hallucinations.
 *
 * Additionally blocks PATH modification — prevents binary hijacking.
 */
export function validateEnv(env: Record<string, string>): string | null {
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();

    // Block known dangerous variables
    if (DANGEROUS_ENV_VARS.has(upper)) {
      return `Blocked: environment variable '${key}' is forbidden (security)`;
    }

    // Block dangerous prefixes (DYLD_*, LD_*)
    for (const prefix of DANGEROUS_ENV_PREFIXES) {
      if (upper.startsWith(prefix)) {
        return `Blocked: environment variable '${key}' matches forbidden prefix '${prefix}'`;
      }
    }

    // Block PATH modification — prevents binary hijacking
    if (upper === "PATH") {
      return `Blocked: custom PATH is forbidden (prevents binary hijacking)`;
    }
  }
  return null;
}
