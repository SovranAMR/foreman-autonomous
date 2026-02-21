/**
 * FOREMAN — CLI Tools
 *
 * LLM-invocable tools for filesystem and terminal interaction.
 * All execution delegates to ExecutionEngine for security and consistency.
 *
 * Tools:
 *   - bash: Execute shell commands (async-capable, timeout, kill)
 *   - read_file: Read file contents (with line-range support)
 *   - write_file: Create or overwrite files
 *   - edit_file: Edit specific parts of a file (now via EditEngine)
 *   - search_files: Search for files by name/pattern
 *   - grep: Search file contents
 *   - list_dir: List directory contents
 *   - batch_write: Atomic multi-file writes with rollback
 *   - git_status: Git status via GitEngine
 *   - git_commit: Git commit via GitEngine
 *   - security_scan: Run project security scan
 *   - verify_build: Parse build output for errors
 *   - verify_tests: Parse test output for results
 *   - web_search: Web search via Brave API
 *   - web_fetch: Fetch URL content
 *   - analyze_links: Classify and fetch URL metadata
 */

import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { ExecutionEngine, truncateMiddle } from "./execution-engine.js";
import { EditEngine } from "./edit-engine.js";
import { batchWrite } from "./batch-file-engine.js";
import { GitEngine } from "./git-engine.js";
import { parseBuildOutput, parseTestOutput } from "./verification-engine.js";
import { scanProject } from "./security-scanner.js";
import { searchFiles } from "./research-engine.js";
import { quickSearch, clearSearchCache, searchCacheStats } from "./web-search-engine.js";
import { webFetch, clearFetchCache, fetchCacheStats } from "./web-fetch-engine.js";
import { LinkIntelligence, classifyUrl } from "./link-intelligence.js";
import { extractCodeFences, extractTables, extractSections, extractLists, parseFrontmatter, extractInlineCode } from "./markdown-intelligence.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  content: string;
  isError: boolean;
}

// ─── TOOL DEFINITIONS (Gemini function calling format) ───────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "bash",
    description:
      "Execute a shell command and return stdout/stderr. Use for running builds, tests, git commands, installing packages, etc. Commands run in the project root directory. Dangerous commands (rm -rf /, sudo, fork bombs) are blocked.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The shell command to execute. Can use pipes, redirects, etc.",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds. Default 30000 (30 seconds).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file. Supports optional line range for reading specific sections. Returns line-numbered output when range is specified.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read (relative to project root or absolute).",
        },
        start_line: {
          type: "number",
          description: "Optional start line (1-indexed). If given, only reads from this line.",
        },
        end_line: {
          type: "number",
          description: "Optional end line (1-indexed, inclusive). If given, reads up to this line.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Create a new file or overwrite an existing file with the given content. Creates parent directories if needed. Path security enforced — cannot write outside project root.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to write (relative to project root or absolute).",
        },
        content: {
          type: "string",
          description: "The full content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing a specific string with another. Use for targeted edits without rewriting the whole file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to edit.",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace. Must match exactly.",
        },
        new_string: {
          type: "string",
          description: "The replacement string.",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for files by name pattern using find. Returns matching file paths. Excludes node_modules and .git.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match files (e.g. '*.ts', 'src/**/*.js').",
        },
        directory: {
          type: "string",
          description: "Directory to search in. Defaults to project root.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description:
      "Search for a text pattern within files. Returns matching lines with file path and line number.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text or regex pattern to search for.",
        },
        path: {
          type: "string",
          description: "File or directory to search. Defaults to project root.",
        },
        include: {
          type: "string",
          description: "File glob to include (e.g. '*.ts'). Only used when path is a directory.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "list_dir",
    description:
      "List the contents of a directory, showing files and subdirectories with sizes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list. Defaults to project root.",
        },
      },
      required: [],
    },
  },
  {
    name: "batch_write",
    description:
      "Atomically write multiple files at once. If any write fails, all changes are rolled back. Use for scaffolding, multi-file changes.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "string",
          description: "JSON array of {path, content} objects. Each path is relative to project root.",
        },
        dry_run: {
          type: "boolean",
          description: "If true, report what would happen without writing.",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "git_status",
    description:
      "Get git status — modified, added, deleted, untracked files.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "git_commit",
    description:
      "Create a git commit with all staged changes. Auto-stages if nothing is staged.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Commit message.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "security_scan",
    description:
      "Scan the project for security issues — leaked secrets, missing .gitignore entries, file permissions, hardcoded values.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "verify_build",
    description:
      "Parse build output to extract errors, warnings, and fix suggestions. Pass the raw build output as input.",
    parameters: {
      type: "object",
      properties: {
        output: {
          type: "string",
          description: "Raw build output (stderr + stdout).",
        },
      },
      required: ["output"],
    },
  },
  {
    name: "verify_tests",
    description:
      "Parse test runner output to extract pass/fail counts, failed test names, and durations.",
    parameters: {
      type: "object",
      properties: {
        output: {
          type: "string",
          description: "Raw test runner output.",
        },
      },
      required: ["output"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web using Brave Search API. Returns titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query.",
        },
        count: {
          type: "number",
          description: "Number of results (default 5, max 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch a URL and extract readable content as markdown. Blocks private IPs (SSRF protection).",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "analyze_link",
    description:
      "Classify a URL (GitHub issue/PR/repo, npm package, StackOverflow, docs, API, etc.) and fetch metadata.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to analyze.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "parse_markdown",
    description:
      "Parse markdown content — extract code fences, tables, sections, lists, frontmatter. Use to understand LLM output structure.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Markdown content to parse.",
        },
        extract: {
          type: "string",
          description: "What to extract: 'code', 'tables', 'sections', 'lists', 'frontmatter', or 'all'.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "list_processes",
    description:
      "List active and recently finished background processes (async shell commands).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "approval_audit",
    description:
      "Show the command approval audit trail — which commands were allowed/denied and their risk scores.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max entries to return. Default 20.",
        },
      },
      required: [],
    },
  },
  {
    name: "git_diff",
    description:
      "Analyze git diff — shows changed files with pattern classification (source/test/config/doc).",
    parameters: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "If true, show only staged changes. Default: all changes.",
        },
      },
      required: [],
    },
  },
  {
    name: "edit_range",
    description:
      "Replace content between specific line numbers. Use when you know exact line range to replace.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to edit.",
        },
        start_line: {
          type: "number",
          description: "Start line (1-indexed, inclusive).",
        },
        end_line: {
          type: "number",
          description: "End line (1-indexed, inclusive).",
        },
        new_content: {
          type: "string",
          description: "Replacement content for the specified line range.",
        },
      },
      required: ["path", "start_line", "end_line", "new_content"],
    },
  },
  {
    name: "edit_undo",
    description:
      "Undo the last edit on a file. Reverts to previous content.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to undo.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "classify_url",
    description:
      "Classify a URL by type (github, npm, docs, api, social, etc.) without fetching it.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to classify.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "cache_stats",
    description:
      "Show web search and fetch cache statistics.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "extract_code",
    description:
      "Extract inline code snippets from markdown/text content.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Text to extract inline code from.",
        },
      },
      required: ["content"],
    },
  },
];

/**
 * Creates a tool executor bound to a project root via ExecutionEngine.
 * All file operations go through the engine's security checks.
 */
export function createToolExecutor(projectRoot: string): (call: ToolCall) => ToolResult {
  const engine = new ExecutionEngine(projectRoot);
  const editEngine = new EditEngine();
  const gitEngine = new GitEngine(engine);
  const linkIntel = new LinkIntelligence();

  return createToolDispatcher(projectRoot, engine, editEngine, gitEngine, linkIntel);
}

/**
 * Create a tool executor connected to Engine's subsystems.
 * Reuses Engine's ApprovalEngine, ProcessRegistry, etc.
 */
export function createEngineToolExecutor(
  projectRoot: string,
  execEngine: ExecutionEngine,
  editEngine: EditEngine,
  gitEngine: GitEngine,
  linkIntel: LinkIntelligence,
): (call: ToolCall) => ToolResult {
  return createToolDispatcher(projectRoot, execEngine, editEngine, gitEngine, linkIntel);
}

function createToolDispatcher(
  projectRoot: string,
  engine: ExecutionEngine,
  editEngine: EditEngine,
  gitEngine: GitEngine,
  linkIntel: LinkIntelligence,
): (call: ToolCall) => ToolResult {
  return (call: ToolCall): ToolResult => {
    try {
      switch (call.name) {
        case "bash":
          return executeBash(engine, call.args);
        case "read_file":
          return executeReadFile(engine, call.args);
        case "write_file":
          return executeWriteFile(engine, call.args);
        case "edit_file":
          return executeEditFileV2(editEngine, call.args);
        case "search_files":
          return executeSearchFiles(projectRoot, call.args);
        case "grep":
          return executeGrep(projectRoot, call.args);
        case "list_dir":
          return executeListDir(projectRoot, call.args);
        case "batch_write":
          return executeBatchWrite(projectRoot, call.args);
        case "git_status":
          return executeGitStatus(gitEngine);
        case "git_commit":
          return executeGitCommit(gitEngine, call.args);
        case "security_scan":
          return executeSecurityScan(projectRoot);
        case "verify_build":
          return executeVerifyBuild(call.args);
        case "verify_tests":
          return executeVerifyTests(call.args);
        case "web_search":
          return executeWebSearch(projectRoot, call.args);
        case "web_fetch":
          return executeWebFetchTool(call.args);
        case "analyze_link":
          return executeAnalyzeLink(linkIntel, call.args);
        case "parse_markdown":
          return executeParseMarkdown(call.args);
        case "list_processes":
          return executeListProcesses();
        case "approval_audit":
          return executeApprovalAudit(projectRoot, call.args);
        case "git_diff":
          return executeGitDiff(gitEngine, call.args);
        case "edit_range":
          return executeEditRange(editEngine, call.args);
        case "edit_undo":
          return executeEditUndo(editEngine, call.args);
        case "classify_url":
          return executeClassifyUrl(call.args);
        case "cache_stats":
          return executeCacheStats();
        case "extract_code":
          return executeExtractCode(call.args);
        default:
          return { name: call.name, content: `Unknown tool: ${call.name}`, isError: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { name: call.name, content: `Error: ${message}`, isError: true };
    }
  };
}

/**
 * Legacy executor — uses cwd as project root.
 * Prefer createToolExecutor(projectRoot) for explicit root.
 */
export function executeTool(call: ToolCall): ToolResult {
  return createToolExecutor(process.cwd())(call);
}

// ─── INDIVIDUAL TOOL IMPLEMENTATIONS ─────────────────────────

function executeBash(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const command = args.command as string;
  const timeout = (args.timeout_ms as number) || 30_000;

  if (!command) {
    return { name: "bash", content: "Error: command is required", isError: true };
  }

  // Delegates to ExecutionEngine — gets dangerous command blocking,
  // timeout, output truncation, duration tracking for free
  const result = engine.runShell(command, timeout);

  let output = "";
  if (result.stdout) output += result.stdout;
  if (result.stderr) output += (output ? "\n" : "") + result.stderr;
  if (result.exitCode !== 0) {
    output += `\nExit code: ${result.exitCode}`;
  }
  if (result.timedOut) {
    output += `\n[Timed out after ${timeout}ms]`;
  }
  if (result.durationMs !== undefined) {
    output += `\n[Duration: ${result.durationMs}ms]`;
  }

  return {
    name: "bash",
    content: truncateMiddle(output || "(no output)"),
    isError: !result.success,
  };
}

function executeReadFile(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  const startLine = args.start_line as number | undefined;
  const endLine = args.end_line as number | undefined;

  if (!filePath) {
    return { name: "read_file", content: "Error: path is required", isError: true };
  }

  // Delegates to ExecutionEngine — gets path security, line-range,
  // totalLines tracking for free
  const result = engine.readFile(filePath, startLine, endLine);

  if (!result.success) {
    return { name: "read_file", content: result.error ?? "Read failed", isError: true };
  }

  let content = result.content ?? "";
  if (result.totalLines !== undefined) {
    content += `\n[Total lines: ${result.totalLines}]`;
  }

  return {
    name: "read_file",
    content: truncateMiddle(content),
    isError: false,
  };
}

function executeWriteFile(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  const content = args.content as string;

  if (!filePath) {
    return { name: "write_file", content: "Error: path is required", isError: true };
  }
  if (content === undefined || content === null) {
    return { name: "write_file", content: "Error: content is required", isError: true };
  }

  // Delegates to ExecutionEngine — gets path security,
  // auto-mkdir, denied path checks for free
  const result = engine.writeFile(filePath, content);

  if (!result.success) {
    return { name: "write_file", content: result.error ?? "Write failed", isError: true };
  }

  return {
    name: "write_file",
    content: `File written: ${filePath} (${content.length} bytes)`,
    isError: false,
  };
}

function resolvePath(base: string, p: string): string {
  if (p.startsWith("~")) {
    return join(homedir(), p.slice(1));
  }
  if (p.startsWith("/")) return p;
  return join(base, p);
}

function executeSearchFiles(projectRoot: string, args: Record<string, unknown>): ToolResult {
  const pattern = args.pattern as string;
  const dir = resolvePath(projectRoot, (args.directory as string) || ".");

  try {
    const result = spawnSync(
      "find",
      [dir, "-name", pattern, "-type", "f", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*"],
      { encoding: "utf-8", timeout: 10_000, maxBuffer: 512 * 1024 },
    );

    const files = (result.stdout || "").trim();
    if (!files) {
      return { name: "search_files", content: "No files found.", isError: false };
    }

    const relPaths = files
      .split("\n")
      .map((f) => relative(projectRoot, f) || f)
      .slice(0, 100);
    return { name: "search_files", content: relPaths.join("\n"), isError: false };
  } catch {
    return { name: "search_files", content: "Search failed.", isError: true };
  }
}

function executeGrep(projectRoot: string, args: Record<string, unknown>): ToolResult {
  const pattern = args.pattern as string;
  const searchPath = resolvePath(projectRoot, (args.path as string) || ".");
  const include = args.include as string | undefined;

  const grepArgs = ["-rnI", "--color=never", "-m", "50"];
  if (include) grepArgs.push("--include", include);
  grepArgs.push("--exclude-dir=node_modules", "--exclude-dir=.git");
  grepArgs.push(pattern, searchPath);

  const result = spawnSync("grep", grepArgs, {
    encoding: "utf-8",
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });

  const output = (result.stdout || "").trim();
  if (!output) {
    return { name: "grep", content: "No matches found.", isError: false };
  }

  const lines = output.split("\n").map((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const absPath = line.slice(0, colonIdx);
      const rest = line.slice(colonIdx);
      return (relative(projectRoot, absPath) || absPath) + rest;
    }
    return line;
  });

  return { name: "grep", content: truncateMiddle(lines.join("\n")), isError: false };
}

function executeListDir(projectRoot: string, args: Record<string, unknown>): ToolResult {
  const dirPath = resolvePath(projectRoot, (args.path as string) || ".");

  if (!existsSync(dirPath)) {
    return { name: "list_dir", content: `Directory not found: ${dirPath}`, isError: true };
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const lines: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (entry.name === "node_modules") {
        lines.push("  📁 node_modules/ (skipped)");
        continue;
      }

      if (entry.isDirectory()) {
        try {
          const count = readdirSync(join(dirPath, entry.name)).length;
          lines.push(`  📁 ${entry.name}/ (${count} items)`);
        } catch {
          lines.push(`  📁 ${entry.name}/`);
        }
      } else {
        try {
          const st = statSync(join(dirPath, entry.name));
          const size =
            st.size < 1024
              ? `${st.size}B`
              : st.size < 1024 * 1024
                ? `${(st.size / 1024).toFixed(1)}K`
                : `${(st.size / (1024 * 1024)).toFixed(1)}M`;
          lines.push(`  📄 ${entry.name} (${size})`);
        } catch {
          lines.push(`  📄 ${entry.name}`);
        }
      }
    }

    const relPath = relative(projectRoot, dirPath) || ".";
    return {
      name: "list_dir",
      content: `${relPath}/\n${lines.join("\n")}`,
      isError: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: "list_dir", content: `Error: ${message}`, isError: true };
  }
}

// ─── NEW TOOL IMPLEMENTATIONS ────────────────────────────────

function executeEditFileV2(editEngine: EditEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  const oldStr = args.old_string as string;
  const newStr = args.new_string as string;

  if (!filePath || oldStr === undefined || newStr === undefined) {
    return { name: "edit_file", content: "Error: path, old_string, and new_string are required", isError: true };
  }

  const result = editEngine.edit({
    filePath,
    oldText: oldStr,
    newText: newStr,
  });

  if (!result.success) {
    let msg = result.message;
    if (result.closestMatch) msg += `\nClosest match at line ${result.closestMatch.startLine}`;
    return { name: "edit_file", content: msg, isError: true };
  }

  let content = `File edited: ${filePath} (${result.replacements} replacement${result.replacements !== 1 ? "s" : ""})`;
  if (result.diff) content += `\n${result.diff}`;
  if (result.warnings.length) content += `\nWarnings: ${result.warnings.join("; ")}`;
  return { name: "edit_file", content, isError: false };
}

function executeBatchWrite(projectRoot: string, args: Record<string, unknown>): ToolResult {
  const filesJson = args.files as string;
  const dryRun = (args.dry_run as boolean) ?? false;

  try {
    const files = JSON.parse(filesJson) as Array<{ path: string; content: string }>;

    // Path security — all paths must be within projectRoot
    for (const f of files) {
      const resolved = f.path.startsWith("/") ? f.path : join(projectRoot, f.path);
      const rel = relative(projectRoot, resolved);
      if (rel.startsWith("..") || rel.startsWith("/")) {
        return { name: "batch_write", content: `Path traversal denied: ${f.path} resolves outside project root`, isError: true };
      }
      // Resolve to absolute so batchWrite uses correct paths
      f.path = resolved;
    }

    const result = batchWrite(files, { dryRun });

    if (!result.success) {
      return { name: "batch_write", content: result.error ?? "Batch write failed", isError: true };
    }

    return {
      name: "batch_write",
      content: result.summary,
      isError: false,
    };
  } catch (err) {
    return { name: "batch_write", content: `Invalid JSON: ${err}`, isError: true };
  }
}

function executeGitStatus(git: GitEngine): ToolResult {
  try {
    const status = git.executor.gitStatus();
    const lines: string[] = [];
    lines.push(`Branch: ${status.branch}`);
    if (status.staged.length > 0) lines.push(`Staged: ${status.staged.join(", ")}`);
    if (status.unstaged.length > 0) lines.push(`Unstaged: ${status.unstaged.join(", ")}`);
    if (status.untracked.length > 0) lines.push(`Untracked: ${status.untracked.join(", ")}`);
    if (status.ahead > 0) lines.push(`Ahead: ${status.ahead}`);
    if (status.behind > 0) lines.push(`Behind: ${status.behind}`);

    if (status.clean) {
      lines.push("Working tree clean");
    }

    return { name: "git_status", content: lines.join("\n"), isError: false };
  } catch {
    return { name: "git_status", content: "Error: git status failed", isError: true };
  }
}

function executeGitCommit(git: GitEngine, args: Record<string, unknown>): ToolResult {
  const message = args.message as string;
  if (!message) {
    return { name: "git_commit", content: "Error: message is required", isError: true };
  }

  const result = git.commit(message);
  if (!result.success) {
    return { name: "git_commit", content: result.error ?? "Commit failed", isError: true };
  }

  return {
    name: "git_commit",
    content: `Committed: ${result.hash ?? result.shortHash ?? "unknown"} — ${message}`,
    isError: false,
  };
}

function executeSecurityScan(projectRoot: string): ToolResult {
  const result = scanProject(projectRoot);
  const lines = [
    `Scanned ${result.scannedFiles} files in ${result.duration}ms`,
    `Critical: ${result.summary.critical}, High: ${result.summary.high}, Medium: ${result.summary.medium}, Low: ${result.summary.low}`,
  ];

  if (result.findings.length > 0) {
    lines.push("");
    for (const f of result.findings.slice(0, 20)) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.title}${f.file ? ` — ${f.file}:${f.line ?? ""}` : ""}`);
      if (f.suggestion) lines.push(`  → ${f.suggestion}`);
    }
    if (result.findings.length > 20) {
      lines.push(`... and ${result.findings.length - 20} more findings`);
    }
  }

  return { name: "security_scan", content: lines.join("\n"), isError: false };
}

function executeVerifyBuild(args: Record<string, unknown>): ToolResult {
  const output = args.output as string;
  if (!output) return { name: "verify_build", content: "Error: output is required", isError: true };

  const result = parseBuildOutput(output);
  const lines = [
    `Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`,
  ];

  for (const err of result.errors.slice(0, 10)) {
    lines.push(`  ${err.file}:${err.line} — ${err.message}`);
    if (err.suggestion) lines.push(`    Fix: ${err.suggestion}`);
  }

  return { name: "verify_build", content: lines.join("\n"), isError: result.errors.length > 0 };
}

function executeVerifyTests(args: Record<string, unknown>): ToolResult {
  const output = args.output as string;
  if (!output) return { name: "verify_tests", content: "Error: output is required", isError: true };

  const result = parseTestOutput(output);
  const lines = [
    `Passed: ${result.passed}, Failed: ${result.failed}, Total: ${result.total}`,
  ];

  if (result.failedTests.length > 0) {
    lines.push("Failed tests:");
    for (const t of result.failedTests) {
      lines.push(`  ✖ ${t}`);
    }
  }

  return { name: "verify_tests", content: lines.join("\n"), isError: result.failed > 0 };
}

function executeWebSearch(projectRoot: string, args: Record<string, unknown>): ToolResult {
  const query = args.query as string;
  if (!query) return { name: "web_search", content: "Error: query is required", isError: true };

  // Try Brave Search API first (real web search)
  const apiKey = process.env.BRAVE_API_KEY;
  if (apiKey) {
    // quickSearch is async — but tool executor is sync
    // Use spawnSync to call it synchronously via inline script
    try {
      const result = spawnSync("node", [
        "-e",
        `import("./src/web-search-engine.js").then(m => m.quickSearch(${JSON.stringify(query)}, ${Number(args.count) || 5}).then(r => process.stdout.write(JSON.stringify(r))))`,
      ], {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 15_000,
        env: { ...process.env, BRAVE_API_KEY: apiKey },
      });

      if (result.stdout) {
        const results = JSON.parse(result.stdout);
        if (results.length > 0) {
          const lines = results.map((r: any, i: number) =>
            `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description?.slice(0, 120) ?? ""}`
          );
          return { name: "web_search", content: lines.join("\n\n"), isError: false };
        }
      }
    } catch {
      // Fall through to local search
    }
  }

  // Fallback: local project file search
  const results = searchFiles(projectRoot, query, "*.ts", 10);
  if (results.length === 0) {
    return { name: "web_search", content: "No results found (no BRAVE_API_KEY set — searched local files only).", isError: false };
  }

  const lines = results.map((r, i) => `${i + 1}. ${r.file}:${r.line} — ${r.text.trim()}`);
  return { name: "web_search", content: `[Local search — set BRAVE_API_KEY for web results]\n${lines.join("\n")}`, isError: false };
}

function executeWebFetchTool(args: Record<string, unknown>): ToolResult {
  const url = args.url as string;
  if (!url) return { name: "web_fetch", content: "Error: url is required", isError: true };

  // webFetch is async — use spawnSync to bridge
  try {
    const script = `
      import { webFetch } from "./src/web-fetch-engine.js";
      const r = await webFetch({ url: ${JSON.stringify(url)}, maxChars: 8000, extractMode: "markdown" });
      process.stdout.write(JSON.stringify({ ok: r.ok, content: r.content?.slice(0, 8000), title: r.title, statusCode: r.statusCode, error: r.error }));
    `;
    const result = spawnSync("node", ["--input-type=module", "-e", script], {
      encoding: "utf-8",
      timeout: 20_000,
      maxBuffer: 512 * 1024,
    });

    if (result.stdout) {
      const data = JSON.parse(result.stdout);
      if (data.ok) {
        let content = "";
        if (data.title) content += `Title: ${data.title}\n\n`;
        content += data.content ?? "(empty)";
        return { name: "web_fetch", content: truncateMiddle(content), isError: false };
      }
      return { name: "web_fetch", content: `Fetch failed: ${data.error ?? `HTTP ${data.statusCode}`}`, isError: true };
    }

    if (result.stderr) {
      return { name: "web_fetch", content: `Fetch error: ${result.stderr.slice(0, 200)}`, isError: true };
    }
  } catch (err) {
    return { name: "web_fetch", content: `Fetch error: ${err}`, isError: true };
  }

  return { name: "web_fetch", content: "Fetch returned no data.", isError: true };
}

function executeAnalyzeLink(linkIntel: LinkIntelligence, args: Record<string, unknown>): ToolResult {
  const url = args.url as string;
  if (!url) return { name: "analyze_link", content: "Error: url is required", isError: true };

  const classification = linkIntel.classify(url);

  // Try async fetch for richer metadata via spawnSync bridge
  try {
    const script = `
      import { LinkIntelligence } from "./src/link-intelligence.js";
      const li = new LinkIntelligence();
      const r = await li.fetch(${JSON.stringify(url)});
      process.stdout.write(JSON.stringify({
        type: r.classification.type,
        domain: r.classification.domain,
        title: r.title,
        summary: r.summary?.slice(0, 500),
        fetchTimeMs: r.fetchTimeMs,
        contentLength: r.content?.length ?? 0,
      }));
    `;
    const result = spawnSync("node", ["--input-type=module", "-e", script], {
      encoding: "utf-8",
      timeout: 15_000,
    });

    if (result.stdout) {
      const data = JSON.parse(result.stdout);
      const lines = [
        `Type: ${data.type}`,
        `Domain: ${data.domain}`,
        data.title ? `Title: ${data.title}` : null,
        data.summary ? `Summary: ${data.summary}` : null,
        `Content: ${data.contentLength} chars (fetched in ${data.fetchTimeMs}ms)`,
      ].filter(Boolean);
      return { name: "analyze_link", content: lines.join("\n"), isError: false };
    }
  } catch {
    // Fall through to basic classification
  }

  return {
    name: "analyze_link",
    content: `Type: ${classification.type}\nDomain: ${classification.domain}\nURL: ${classification.url}`,
    isError: false,
  };
}

function executeParseMarkdown(args: Record<string, unknown>): ToolResult {
  const content = args.content as string;
  const extract = (args.extract as string) ?? "all";

  if (!content) return { name: "parse_markdown", content: "Error: content is required", isError: true };

  const parts: string[] = [];

  if (extract === "code" || extract === "all") {
    const fences = extractCodeFences(content);
    if (fences.length > 0) {
      parts.push(`Code fences (${fences.length}):`);
      for (const f of fences) {
        parts.push(`  [${f.language || "unknown"}] ${f.content.length} chars, line ${f.startLine}`);
      }
    }
  }

  if (extract === "tables" || extract === "all") {
    const tables = extractTables(content);
    if (tables.length > 0) {
      parts.push(`Tables (${tables.length}):`);
      for (const t of tables) {
        parts.push(`  ${t.headers.join(" | ")} — ${t.rows.length} rows`);
      }
    }
  }

  if (extract === "sections" || extract === "all") {
    const sections = extractSections(content);
    parts.push(`Sections (${sections.length}):`);
    for (const s of sections) {
      parts.push(`  ${"#".repeat(s.level)} ${s.heading} (${s.content.length} chars)`);
    }
  }

  if (extract === "lists" || extract === "all") {
    const lists = extractLists(content);
    if (lists.length > 0) {
      parts.push(`List items (${lists.length})`);
    }
  }

  if (extract === "frontmatter" || extract === "all") {
    const fm = parseFrontmatter(content);
    if (fm.metadata && Object.keys(fm.metadata).length > 0) {
      parts.push(`Frontmatter: ${JSON.stringify(fm.metadata)}`);
    }
  }

  return {
    name: "parse_markdown",
    content: parts.join("\n") || "No extractable content found.",
    isError: false,
  };
}

// ─── NEW TOOL IMPLEMENTATIONS (list_processes, approval_audit, git_diff) ─────

function executeListProcesses(): ToolResult {
  // ProcessRegistry is a singleton-like — but tools.ts doesn't have access to
  // Engine's instance. Return info about current PID's child processes instead.
  try {
    const result = spawnSync("ps", ["--ppid", String(process.pid), "-o", "pid,stat,time,comm", "--no-headers"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const output = (result.stdout || "").trim();
    if (!output) {
      return { name: "list_processes", content: "No active child processes.", isError: false };
    }
    return { name: "list_processes", content: `Active processes:\n${output}`, isError: false };
  } catch {
    return { name: "list_processes", content: "Process listing unavailable.", isError: true };
  }
}

function executeApprovalAudit(projectRoot: string, args: Record<string, unknown>): ToolResult {
  const limit = (args.limit as number) || 20;
  try {
    const auditPath = join(projectRoot, ".foreman", "approvals.json");
    if (!existsSync(auditPath)) {
      return { name: "approval_audit", content: "No approval history yet.", isError: false };
    }
    const data = JSON.parse(readFileSync(auditPath, "utf-8"));
    const history = (data.history ?? []).slice(-limit);
    if (history.length === 0) {
      return { name: "approval_audit", content: "No approval history entries.", isError: false };
    }

    const lines = history.map((h: any) => {
      const risk = h.riskScore !== undefined ? ` (risk: ${(h.riskScore * 100).toFixed(0)}%)` : "";
      return `${h.decision === "allow" ? "✅" : "❌"} ${h.command?.slice(0, 60)}${risk} [${h.layer ?? "?"}]`;
    });
    return { name: "approval_audit", content: lines.join("\n"), isError: false };
  } catch (err) {
    return { name: "approval_audit", content: `Error reading audit: ${err}`, isError: true };
  }
}

function executeGitDiff(git: GitEngine, args: Record<string, unknown>): ToolResult {
  try {
    const staged = args.staged as boolean ?? false;
    const changes = git.classifyChanges(staged);
    const summary = git.summarizeChanges(staged);

    if (changes.length === 0) {
      return { name: "git_diff", content: "No changes.", isError: false };
    }

    const lines: string[] = [];
    if (summary) lines.push(summary);
    lines.push("");
    for (const c of changes.slice(0, 30)) {
      lines.push(`  ${c.kind} ${c.file} +${c.insertions}/-${c.deletions}`);
    }
    if (changes.length > 30) {
      lines.push(`  ... and ${changes.length - 30} more files`);
    }
    return { name: "git_diff", content: lines.join("\n"), isError: false };
  } catch {
    return { name: "git_diff", content: "Git diff failed (not a git repo?).", isError: true };
  }
}

function executeEditRange(editEngine: EditEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  const startLine = args.start_line as number;
  const endLine = args.end_line as number;
  const newContent = args.new_content as string;

  if (!filePath || !startLine || !endLine || newContent === undefined) {
    return { name: "edit_range", content: "Error: path, start_line, end_line, and new_content are required", isError: true };
  }

  const result = editEngine.editByLineRange({
    filePath,
    startLine,
    endLine,
    newContent,
  });

  if (!result.success) {
    return { name: "edit_range", content: result.message, isError: true };
  }

  return {
    name: "edit_range",
    content: `Replaced lines ${startLine}-${endLine} in ${filePath}`,
    isError: false,
  };
}

function executeEditUndo(editEngine: EditEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  if (!filePath) {
    return { name: "edit_undo", content: "Error: path is required", isError: true };
  }

  const result = editEngine.undo(filePath);
  if (!result.success) {
    return { name: "edit_undo", content: result.message, isError: true };
  }

  return {
    name: "edit_undo",
    content: `Undone last edit on ${filePath}`,
    isError: false,
  };
}

function executeClassifyUrl(args: Record<string, unknown>): ToolResult {
  const url = args.url as string;
  if (!url) return { name: "classify_url", content: "Error: url is required", isError: true };

  const result = classifyUrl(url);
  return {
    name: "classify_url",
    content: `Type: ${result.kind}\nDomain: ${result.domain}\nConfidence: ${(result.confidence * 100).toFixed(0)}%`,
    isError: false,
  };
}

function executeCacheStats(): ToolResult {
  const searchStats = searchCacheStats();
  const fetchStats = fetchCacheStats();
  return {
    name: "cache_stats",
    content: `Search cache: ${searchStats.size}/${searchStats.maxEntries} entries\nFetch cache: ${fetchStats.size} entries`,
    isError: false,
  };
}

function executeExtractCode(args: Record<string, unknown>): ToolResult {
  const content = args.content as string;
  if (!content) return { name: "extract_code", content: "Error: content is required", isError: true };

  const inlineCode = extractInlineCode(content);
  if (inlineCode.length === 0) {
    return { name: "extract_code", content: "No inline code found.", isError: false };
  }
  return {
    name: "extract_code",
    content: inlineCode.join("\n"),
    isError: false,
  };
}

// ─── GEMINI FUNCTION DECLARATIONS FORMAT ─────────────────────

/**
 * Convert tool definitions to Gemini API functionDeclarations format.
 */
export function toGeminiFunctionDeclarations(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
