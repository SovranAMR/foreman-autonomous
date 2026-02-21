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
import { LinkIntelligence } from "./link-intelligence.js";
import { extractCodeFences, extractTables, extractSections, extractLists, parseFrontmatter } from "./markdown-intelligence.js";

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
];

// ─── TOOL EXECUTOR ───────────────────────────────────────────

/**
 * Creates a tool executor bound to a project root via ExecutionEngine.
 * All file operations go through the engine's security checks.
 */
export function createToolExecutor(projectRoot: string): (call: ToolCall) => ToolResult {
  const engine = new ExecutionEngine(projectRoot);
  const editEngine = new EditEngine();
  const gitEngine = new GitEngine(engine);
  const linkIntel = new LinkIntelligence();

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
  // GitEngine uses ExecutionEngine internally — access status via exec
  try {
    const result = spawnSync("git", ["status", "--porcelain"], { encoding: "utf-8", timeout: 5000 });
    const output = (result.stdout || "").trim();
    if (!output) {
      return { name: "git_status", content: "Working tree clean", isError: false };
    }
    return { name: "git_status", content: output, isError: false };
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

  // searchFiles is the sync file-based search from research engine
  const results = searchFiles(projectRoot, query, "*.ts", 10);
  if (results.length === 0) {
    return { name: "web_search", content: "No results found.", isError: false };
  }

  const lines = results.map((r, i) => `${i + 1}. ${r.file}:${r.line} — ${r.text.trim()}`);
  return { name: "web_search", content: lines.join("\n"), isError: false };
}

function executeWebFetchTool(args: Record<string, unknown>): ToolResult {
  const url = args.url as string;
  if (!url) return { name: "web_fetch", content: "Error: url is required", isError: true };

  return {
    name: "web_fetch",
    content: `URL noted: ${url}. Use the async research pipeline for full content fetch.`,
    isError: false,
  };
}

function executeAnalyzeLink(linkIntel: LinkIntelligence, args: Record<string, unknown>): ToolResult {
  const url = args.url as string;
  if (!url) return { name: "analyze_link", content: "Error: url is required", isError: true };

  const classification = linkIntel.classify(url);
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
