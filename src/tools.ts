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
import { searchFiles, stripHtml } from "./research-engine.js";
import { quickSearch, clearSearchCache, searchCacheStats } from "./web-search-engine.js";
import { webFetch, clearFetchCache, fetchCacheStats } from "./web-fetch-engine.js";
import { LinkIntelligence, classifyUrl } from "./link-intelligence.js";
import { extractCodeFences, extractTables, extractSections, extractLists, parseFrontmatter, extractInlineCode } from "./markdown-intelligence.js";
import type { HooksEngine } from "./hooks-engine.js";

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
      "Execute a shell command and return stdout/stderr. Use for running builds, tests, git commands, installing packages, etc. Commands run in the project root directory. Dangerous commands (rm -rf /, sudo, fork bombs) are blocked. Supports background execution with yield_ms or background flag — long-running commands return a session ID for polling.",
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
        yield_ms: {
          type: "number",
          description: "Milliseconds to wait before backgrounding (default 10000). If the command doesn't finish within this window, it runs in the background and returns a session ID for polling.",
        },
        background: {
          type: "boolean",
          description: "If true, immediately background the command and return a session ID.",
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
      "List active and recently finished background processes (async shell commands). Shows session ID, status, PID, runtime, and tail of output.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "poll_process",
    description:
      "Poll a background process for new output. Returns new stdout/stderr since last poll and current status. Use after backgrounding a command via bash with yield_ms or background=true.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session ID from bash background execution.",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "process_log",
    description:
      "Get full log output from a process session (running or finished). Supports offset/limit for large outputs.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session ID to get log from.",
        },
        offset: {
          type: "number",
          description: "Start line (0-indexed). If omitted with limit, shows last N lines.",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to return.",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "kill_process",
    description:
      "Kill a specific background process by session ID. Uses graceful shutdown: SIGTERM → wait 3s → SIGKILL.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Session ID to kill.",
        },
        signal: {
          type: "string",
          description: "Signal to send. Default SIGTERM (graceful). Use SIGKILL for immediate.",
        },
      },
      required: ["session_id"],
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
  {
    name: "delete_file",
    description:
      "Delete a file. Use with caution.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to delete.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_in_files",
    description:
      "Search for a pattern across project files. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text pattern to search for.",
        },
        extensions: {
          type: "string",
          description: "Comma-separated file extensions to search (e.g. 'ts,js'). Default: all files.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "kill_processes",
    description:
      "Kill all active background processes.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "batch_ops",
    description:
      "Execute multiple file operations atomically (read/write/edit/delete). Uses ExecutionEngine.executeOperations for unified security.",
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          description: "Array of file operations",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "Operation type: read, write, edit, delete" },
              path: { type: "string", description: "File path" },
              content: { type: "string", description: "Content for write operations" },
              oldText: { type: "string", description: "Text to find for edit operations" },
              newText: { type: "string", description: "Replacement text for edit operations" },
            },
            required: ["type", "path"],
          },
        },
      },
      required: ["operations"],
    },
  },
  {
    name: "git_log",
    description:
      "Show recent git commit history.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of commits (default 10)" },
      },
      required: [],
    },
  },
  // ─── NEW: Media, Cron, Session, Embedding tools ──────────
  {
    name: "analyze_media",
    description: "Analyze a media file — detect MIME type, size, category (image/audio/video/document/code).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to analyze" },
      },
      required: ["path"],
    },
  },
  {
    name: "download_file",
    description: "Download a file from a URL to the project's media directory.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to download" },
        filename: { type: "string", description: "Optional filename to save as" },
      },
      required: ["url"],
    },
  },
  {
    name: "cron_list",
    description: "List all scheduled cron jobs.",
    parameters: {
      type: "object",
      properties: {
        include_disabled: { type: "boolean", description: "Include disabled jobs (default false)" },
      },
      required: [],
    },
  },
  {
    name: "cron_add",
    description: "Add a new scheduled job. Schedule types: 'at' (one-shot ISO timestamp), 'every' (interval in ms), 'cron' (cron expression).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Job name" },
        schedule_kind: { type: "string", description: "Schedule type: at, every, or cron" },
        schedule_value: { type: "string", description: "ISO timestamp (at), milliseconds (every), or cron expression (cron)" },
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["name", "schedule_kind", "schedule_value", "command"],
    },
  },
  {
    name: "cron_remove",
    description: "Remove a scheduled cron job by ID.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID to remove" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "session_list",
    description: "List all sessions (main + sub-agents). Optional filter by status.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: idle, running, completed, failed, terminated" },
      },
      required: [],
    },
  },
  {
    name: "session_spawn",
    description: "Spawn a sub-agent session for a background task.",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description for the sub-agent" },
        label: { type: "string", description: "Session label" },
      },
      required: ["task"],
    },
  },
  {
    name: "semantic_search",
    description: "Search indexed documents using semantic similarity (requires embedding provider).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        top_k: { type: "number", description: "Number of results (default 5)" },
      },
      required: ["query"],
    },
  },
  // ─── BROWSER TOOLS ───────────────────────────────────────
  {
    name: "browser_navigate",
    description: "Navigate to a URL and get page info (title, status code). Use to check if a website/dev server is working.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of a web page. Returns base64 image. Use to visually verify a website or UI.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to screenshot" },
        full_page: { type: "boolean", description: "Capture full page (default false)" },
        selector: { type: "string", description: "CSS selector to screenshot specific element" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_extract",
    description: "Extract content from a web page — text, links, headings, images, forms. Use for scraping or analysis.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to extract content from" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_pdf",
    description: "Generate a PDF from a web page. Use for documentation or reports.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to convert to PDF" },
        output_path: { type: "string", description: "Output file path (optional)" },
      },
      required: ["url"],
    },
  },
  // ─── IDENTITY & MEMORY TOOLS ─────────────────────────────
  {
    name: "memory_read",
    description: "Read a value from persistent memory. Memory survives across sessions.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to read" },
      },
      required: ["key"],
    },
  },
  {
    name: "memory_write",
    description: "Write a value to persistent memory. Use to remember important information across sessions.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Value to store" },
        section: { type: "string", description: "Memory section (optional)" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "memory_search",
    description: "Search persistent memory for matching entries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "spawn_subagent",
    description: "Spawn a sub-agent to handle a task in parallel. Use for complex tasks that can be divided.",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task for the sub-agent" },
        role: { type: "string", description: "Role (frontend, backend, testing, research)" },
        label: { type: "string", description: "Human-readable label" },
      },
      required: ["task"],
    },
  },
  {
    name: "diff_preview",
    description: "Show a unified diff of what will change in a file before writing. Use before write_file to review changes.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        new_content: { type: "string", description: "Proposed new content" },
      },
      required: ["path", "new_content"],
    },
  },
  {
    name: "forge_pipeline",
    description: `Run the full Forge pipeline (Visioner → Strategist → Researcher → Worker) for complex tasks. 
Use this when the task requires:
- Multi-file changes across a project
- Building new features or components from scratch
- Major refactors that touch many files
- UI/design work that needs vision and review
- Tasks that need planning, research, and multi-step execution
- Anything that goes beyond simple file edits or quick fixes

Do NOT use for:
- Simple file reads or quick edits
- Running a single command
- Answering questions
- Small bug fixes in one file

The pipeline will: analyze the task → create a vision document → decompose into blocks → research → execute each atom with verification → visual QA → rollback on failure.
Returns a summary of what was done.`,
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Detailed description of what to build/fix/refactor. Be specific about requirements, files, and expected behavior.",
        },
        project_root: {
          type: "string",
          description: "Project root directory. Defaults to current working directory if not specified.",
        },
      },
      required: ["task"],
    },
  },
];

/**
 * Creates a tool executor bound to a project root via ExecutionEngine.
 * All file operations go through the engine's security checks.
 */
export function createToolExecutor(projectRoot: string): (call: ToolCall) => Promise<ToolResult> {
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
  hooksEngine?: HooksEngine,
): (call: ToolCall) => Promise<ToolResult> {
  return createToolDispatcher(projectRoot, execEngine, editEngine, gitEngine, linkIntel, hooksEngine);
}

function createToolDispatcher(
  projectRoot: string,
  engine: ExecutionEngine,
  editEngine: EditEngine,
  gitEngine: GitEngine,
  linkIntel: LinkIntelligence,
  hooksEngine?: HooksEngine,
): (call: ToolCall) => Promise<ToolResult> {
  return async (call: ToolCall): Promise<ToolResult> => {
    // ─── HOOK: before_tool_call ─────────────────────────────
    if (hooksEngine) {
      const beforeResult = await hooksEngine.run("before_tool_call", {
        tool: call.name,
        args: call.args,
      });
      if (beforeResult.block) {
        return {
          name: call.name,
          content: `Tool call blocked: ${beforeResult.blockReason}`,
          isError: true,
        };
      }
    }

    // ─── TOOL-SPECIFIC HOOKS ────────────────────────────────
    // Run specialized hooks for specific tools
    if (hooksEngine && call.name === "bash") {
      const cmdResult = await hooksEngine.run("before_command", {
        command: call.args.command,
        timeout: call.args.timeout_ms,
      });
      if (cmdResult.block) {
        return {
          name: "bash",
          content: `Command blocked: ${cmdResult.blockReason}`,
          isError: true,
        };
      }
    }

    if (hooksEngine && call.name === "write_file") {
      const fileResult = await hooksEngine.run("before_file_write", {
        path: call.args.path,
        content: call.args.content,
      });
      if (fileResult.block) {
        return {
          name: "write_file",
          content: `Write blocked: ${fileResult.blockReason}`,
          isError: true,
        };
      }
    }

    let result: ToolResult;

    try {
      switch (call.name) {
        case "bash":
          result = await executeBash(engine, call.args);
          break;
        case "read_file":
          result = executeReadFile(engine, call.args);
          break;
        case "write_file":
          result = executeWriteFile(engine, call.args);
          break;
        case "edit_file":
          result = executeEditFileV2(editEngine, call.args);
          break;
        case "search_files":
          result = executeSearchFiles(projectRoot, call.args);
          break;
        case "grep":
          result = executeGrep(projectRoot, call.args);
          break;
        case "list_dir":
          result = executeListDir(projectRoot, call.args);
          break;
        case "batch_write":
          result = executeBatchWrite(projectRoot, call.args);
          break;
        case "git_status":
          result = executeGitStatus(gitEngine);
          break;
        case "git_commit":
          result = executeGitCommit(gitEngine, call.args);
          break;
        case "security_scan":
          result = executeSecurityScan(projectRoot);
          break;
        case "verify_build":
          result = executeVerifyBuild(call.args);
          break;
        case "verify_tests":
          result = executeVerifyTests(call.args);
          break;
        case "web_search":
          result = executeWebSearch(projectRoot, call.args);
          break;
        case "web_fetch":
          result = executeWebFetchTool(call.args);
          break;
        case "analyze_link":
          result = executeAnalyzeLink(linkIntel, call.args);
          break;
        case "parse_markdown":
          result = executeParseMarkdown(call.args);
          break;
        case "list_processes":
          result = executeListProcesses(engine);
          break;
        case "poll_process":
          result = executePollProcess(engine, call.args);
          break;
        case "process_log":
          result = executeProcessLog(engine, call.args);
          break;
        case "kill_process":
          result = executeKillProcess(engine, call.args);
          break;
        case "approval_audit":
          result = executeApprovalAudit(projectRoot, call.args);
          break;
        case "git_diff":
          result = executeGitDiff(gitEngine, call.args);
          break;
        case "edit_range":
          result = executeEditRange(editEngine, call.args);
          break;
        case "edit_undo":
          result = executeEditUndo(editEngine, call.args);
          break;
        case "classify_url":
          result = executeClassifyUrl(call.args);
          break;
        case "cache_stats":
          result = executeCacheStats();
          break;
        case "extract_code":
          result = executeExtractCode(call.args);
          break;
        case "delete_file":
          result = executeDeleteFile(engine, call.args);
          break;
        case "search_in_files":
          result = executeSearchInFiles(engine, call.args);
          break;
        case "kill_processes":
          result = executeKillProcesses(engine);
          break;
        case "batch_ops":
          result = executeBatchOps(engine, call.args);
          break;
        case "git_log":
          result = executeGitLog(gitEngine, call.args);
          break;
        case "analyze_media":
          result = executeAnalyzeMedia(engine, call.args);
          break;
        case "download_file":
          result = await executeDownloadFile(engine, call.args);
          break;
        case "cron_list":
          result = executeCronList(engine, call.args);
          break;
        case "cron_add":
          result = executeCronAdd(engine, call.args);
          break;
        case "cron_remove":
          result = executeCronRemove(engine, call.args);
          break;
        case "session_list":
          result = executeSessionList(engine, call.args);
          break;
        case "session_spawn":
          result = executeSessionSpawn(engine, call.args);
          break;
        case "semantic_search":
          result = await executeSemanticSearch(engine, call.args);
          break;

        // ─── BROWSER TOOLS ──────────────────────────────────
        case "browser_navigate":
          result = await executeBrowserNavigate(engine, call.args);
          break;
        case "browser_screenshot":
          result = await executeBrowserScreenshot(engine, call.args);
          break;
        case "browser_extract":
          result = await executeBrowserExtract(engine, call.args);
          break;
        case "browser_pdf":
          result = await executeBrowserPdf(engine, call.args);
          break;

        // ─── IDENTITY & MEMORY TOOLS ────────────────────────
        case "memory_read":
          result = await executeMemoryRead(engine, call.args);
          break;
        case "memory_write":
          result = await executeMemoryWrite(engine, call.args);
          break;
        case "memory_search":
          result = await executeMemorySearch(engine, call.args);
          break;

        // ─── SUB-AGENT TOOLS ────────────────────────────────
        case "spawn_subagent":
          result = await executeSpawnSubagent(engine, call.args);
          break;

        // ─── DIFF TOOLS ─────────────────────────────────────
        case "diff_preview":
          result = await executeDiffPreview(engine, call.args);
          break;

        case "forge_pipeline":
          result = await executeForge(projectRoot, call.args);
          break;

        default:
          result = { name: call.name, content: `Unknown tool: ${call.name}`, isError: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result = { name: call.name, content: `Error: ${message}`, isError: true };
    }

    // ─── HOOK: after_tool_call ──────────────────────────────
    if (hooksEngine) {
      await hooksEngine.run("after_tool_call", {
        tool: call.name,
        args: call.args,
        result: result,
      });
    }

    return result;
  };
}

/**
 * Legacy executor — uses cwd as project root.
 * Prefer createToolExecutor(projectRoot) for explicit root.
 */
export function executeTool(call: ToolCall): Promise<ToolResult> {
  return createToolExecutor(process.cwd())(call);
}

// ─── INDIVIDUAL TOOL IMPLEMENTATIONS ─────────────────────────

function executeBash(
  engine: ExecutionEngine,
  args: Record<string, unknown>,
): ToolResult | Promise<ToolResult> {
  const command = args.command as string;
  const timeout = (args.timeout_ms as number) || 30_000;
  const yieldMs = args.yield_ms as number | undefined;
  const background = args.background as boolean | undefined;

  if (!command) {
    return { name: "bash", content: "Error: command is required", isError: true };
  }

  // If yield_ms or background is specified, use background execution
  if (yieldMs !== undefined || background === true) {
    return executeBashBackground(engine, command, {
      yieldMs,
      background,
      timeoutMs: timeout,
    });
  }

  // Sync execution for simple/quick commands (backward compatible)
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

/**
 * Background bash execution with yieldMs pattern.
 * Inspired by OpenClaw's exec tool background/yieldMs support.
 */
async function executeBashBackground(
  engine: ExecutionEngine,
  command: string,
  options: {
    yieldMs?: number;
    background?: boolean;
    timeoutMs: number;
  },
): Promise<ToolResult> {
  const bgResult = await engine.runShellBackground(command, {
    yieldMs: options.yieldMs,
    background: options.background,
    timeoutMs: options.timeoutMs,
  });

  if (bgResult.completed && bgResult.result) {
    // Command finished within yield window — return normal result
    const result = bgResult.result;
    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? "\n" : "") + result.stderr;
    if (result.exitCode !== 0) {
      output += `\nExit code: ${result.exitCode}`;
    }
    if (result.timedOut) {
      output += `\n[Timed out after ${options.timeoutMs}ms]`;
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

  // Command was backgrounded
  const lines = [
    `Command running in background (session ${bgResult.sessionId}, pid ${bgResult.pid ?? "n/a"}).`,
    `Use poll_process(session_id="${bgResult.sessionId}") to check output.`,
    `Use process_log(session_id="${bgResult.sessionId}") to get full log.`,
    `Use kill_process(session_id="${bgResult.sessionId}") to stop it.`,
  ];
  if (bgResult.tail) {
    lines.push(`\nOutput so far:\n${bgResult.tail}`);
  }

  return {
    name: "bash",
    content: lines.join("\n"),
    isError: false,
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

function executeWriteFile(
  engine: ExecutionEngine,
  args: Record<string, unknown>,
): ToolResult {
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
        // Strip any remaining HTML tags from content
        const cleaned = stripHtml(data.content ?? "(empty)");
        content += cleaned;
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

function executeListProcesses(engine: ExecutionEngine): ToolResult {
  try {
    // Try registry-based listing first (richer info)
    const registry = (engine as any).registry;
    if (registry) {
      const running = registry.listRunning();
      const finished = registry.listFinished();

      if (running.length === 0 && finished.length === 0) {
        return { name: "list_processes", content: "No running or recent sessions.", isError: false };
      }

      const lines: string[] = [];
      for (const s of running) {
        const runtime = Math.round((Date.now() - s.startedAt) / 1000);
        const bg = s.backgrounded ? " [bg]" : "";
        const cmd = s.command.length > 80 ? s.command.slice(0, 77) + "..." : s.command;
        lines.push(`${s.id} running  ${runtime}s${bg} :: ${cmd}`);
      }
      for (const s of finished) {
        const duration = Math.round(s.durationMs / 1000);
        const cmd = s.command.length > 80 ? s.command.slice(0, 77) + "..." : s.command;
        lines.push(`${s.id} ${s.status.padEnd(9)} ${duration}s :: ${cmd}`);
      }

      return { name: "list_processes", content: lines.join("\n"), isError: false };
    }

    // Fallback to basic listing
    const processes = engine.listProcesses();
    if (processes.length === 0) {
      return { name: "list_processes", content: "No active processes.", isError: false };
    }
    const lines = processes.map(p => `  PID ${p.pid ?? "?"} — ${p.id}`);
    return { name: "list_processes", content: `Active processes:\n${lines.join("\n")}`, isError: false };
  } catch {
    return { name: "list_processes", content: "Process listing unavailable.", isError: true };
  }
}

/**
 * Poll a background process for new output.
 * Inspired by OpenClaw's process tool "poll" action.
 */
function executePollProcess(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const sessionId = args.session_id as string;
  if (!sessionId) {
    return { name: "poll_process", content: "Error: session_id is required", isError: true };
  }

  const registry = (engine as any).registry;
  if (!registry) {
    return { name: "poll_process", content: "Process registry not available.", isError: true };
  }

  const pollResult = registry.poll(sessionId);
  if (!pollResult) {
    return { name: "poll_process", content: `No session found for ${sessionId}`, isError: true };
  }

  const output = [pollResult.stdout, pollResult.stderr].filter(Boolean).join("\n").trim();
  const isExited = pollResult.status !== "running";

  let content = output || "(no new output)";
  if (isExited) {
    const exitInfo = pollResult.exitCode !== undefined
      ? `code ${pollResult.exitCode}`
      : `status ${pollResult.status}`;
    content += `\n\nProcess exited with ${exitInfo}.`;
  } else {
    content += "\n\nProcess still running.";
  }

  return {
    name: "poll_process",
    content,
    isError: isExited && pollResult.exitCode !== 0,
  };
}

/**
 * Get full log from a process session.
 * Inspired by OpenClaw's process tool "log" action.
 */
function executeProcessLog(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const sessionId = args.session_id as string;
  if (!sessionId) {
    return { name: "process_log", content: "Error: session_id is required", isError: true };
  }

  const registry = (engine as any).registry;
  if (!registry) {
    return { name: "process_log", content: "Process registry not available.", isError: true };
  }

  const logResult = registry.getLog(sessionId, {
    offset: args.offset as number | undefined,
    limit: args.limit as number | undefined,
  });

  if (!logResult) {
    return { name: "process_log", content: `No session found for ${sessionId}`, isError: true };
  }

  return {
    name: "process_log",
    content: `${logResult.text}\n\n[${logResult.totalLines} lines, ${logResult.totalChars} chars, status: ${logResult.status}${logResult.truncated ? ", truncated" : ""}]`,
    isError: false,
  };
}

/**
 * Kill a specific background process.
 * Uses graceful shutdown: SIGTERM → wait → SIGKILL.
 * Inspired by OpenClaw's process tool "kill" action.
 */
function executeKillProcess(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const sessionId = args.session_id as string;
  if (!sessionId) {
    return { name: "kill_process", content: "Error: session_id is required", isError: true };
  }

  const registry = (engine as any).registry;
  if (!registry) {
    return { name: "kill_process", content: "Process registry not available.", isError: true };
  }

  const signal = (args.signal as string as NodeJS.Signals) || "SIGTERM";
  const killed = registry.kill(sessionId, signal);

  if (!killed) {
    return { name: "kill_process", content: `No active session found for ${sessionId}`, isError: true };
  }

  return {
    name: "kill_process",
    content: `Sent ${signal} to session ${sessionId}. ${signal === "SIGKILL" ? "Process killed immediately." : "Process will be killed (SIGKILL) if it doesn't exit within 3 seconds."}`,
    isError: false,
  };
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

function executeDeleteFile(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  if (!filePath) return { name: "delete_file", content: "Error: path is required", isError: true };

  const result = engine.deleteFile(filePath);
  if (!result.success) {
    return { name: "delete_file", content: result.error ?? "Delete failed", isError: true };
  }
  return { name: "delete_file", content: `Deleted: ${filePath}`, isError: false };
}

function executeSearchInFiles(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const pattern = args.pattern as string;
  if (!pattern) return { name: "search_in_files", content: "Error: pattern is required", isError: true };

  const extensions = (args.extensions as string)?.split(",").map(s => s.trim()) ?? [];
  const results = engine.searchInFiles(pattern, extensions.length > 0 ? extensions : undefined);

  if (!results.success || !results.matches || results.matches.length === 0) {
    return { name: "search_in_files", content: "No matches found.", isError: false };
  }

  const lines = results.matches.slice(0, 50).map((m: any) =>
    `${m.file}:${m.line}: ${m.content?.trim() ?? ""}`
  );
  if (results.matches.length > 50) {
    lines.push(`... and ${results.matches.length - 50} more matches`);
  }
  return { name: "search_in_files", content: lines.join("\n"), isError: false };
}

function executeKillProcesses(engine: ExecutionEngine): ToolResult {
  engine.killAllProcesses();
  return { name: "kill_processes", content: "All background processes killed.", isError: false };
}

function executeBatchOps(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const ops = args.operations as Array<{
    type: string;
    path: string;
    content?: string;
    oldText?: string;
    newText?: string;
    startLine?: number;
    endLine?: number;
  }>;
  if (!Array.isArray(ops) || ops.length === 0) {
    return { name: "batch_ops", content: "Error: operations array required", isError: true };
  }

  const validTypes = new Set(["read", "write", "edit", "create", "delete"]);
  const validOps = ops.filter(op => validTypes.has(op.type)) as import("./execution-engine.js").FileOperation[];
  if (validOps.length === 0) {
    return { name: "batch_ops", content: "Error: no valid operations (type must be read/write/edit/create/delete)", isError: true };
  }

  const results = engine.executeOperations(validOps);
  const summary = results.map(r =>
    r.success ? `✔ ${r.path}` : `✖ ${r.path}: ${r.error ?? "unknown"}`
  ).join("\n");

  const hasErrors = results.some(r => !r.success);
  return {
    name: "batch_ops",
    content: `Batch operations: ${results.filter(r => r.success).length}/${results.length} succeeded\n${summary}`,
    isError: hasErrors,
  };
}

function executeGitLog(gitEngine: GitEngine, args: Record<string, unknown>): ToolResult {
  const count = (args.count as number) ?? 10;
  const result = gitEngine.executor.gitLog(count);
  if (!result.success) {
    return { name: "git_log", content: `Git log error: ${result.stderr}`, isError: true };
  }
  return { name: "git_log", content: result.stdout.slice(0, 3000), isError: false };
}

// ─── NEW ENGINE TOOL EXECUTORS ───────────────────────────────

function executeAnalyzeMedia(engine: any, args: Record<string, unknown>): ToolResult {
  const path = args.path as string;
  if (!path) return { name: "analyze_media", content: "Error: path required", isError: true };

  if (!engine.mediaEngine) {
    return { name: "analyze_media", content: "Media engine not available (standalone executor)", isError: true };
  }

  const result = engine.mediaEngine.analyze(path);
  if (!result) return { name: "analyze_media", content: `File not found: ${path}`, isError: true };

  return {
    name: "analyze_media",
    content: [
      `File: ${result.filename}`,
      `MIME: ${result.mimeType}`,
      `Category: ${result.category}`,
      `Size: ${result.size} bytes`,
      `Hash: ${result.hash}`,
    ].join("\n"),
    isError: false,
  };
}

async function executeDownloadFile(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) return { name: "download_file", content: "Error: url required", isError: true };

  if (!engine.mediaEngine) {
    return { name: "download_file", content: "Media engine not available", isError: true };
  }

  const result = await engine.mediaEngine.download(url, args.filename as string | undefined);
  if (!result.success) {
    return { name: "download_file", content: `Download failed: ${result.error}`, isError: true };
  }

  return {
    name: "download_file",
    content: `Downloaded: ${result.filename}\nPath: ${result.path}\nSize: ${result.size} bytes\nMIME: ${result.mimeType}`,
    isError: false,
  };
}

function executeCronList(engine: any, args: Record<string, unknown>): ToolResult {
  if (!engine.cronEngine) return { name: "cron_list", content: "Cron engine not available", isError: true };

  const includeDisabled = (args.include_disabled as boolean) ?? false;
  const jobs = engine.cronEngine.listJobs(includeDisabled);

  if (jobs.length === 0) {
    return { name: "cron_list", content: "No scheduled jobs.", isError: false };
  }

  const lines = jobs.map(j => {
    const nextRun = j.nextRunAt ? new Date(j.nextRunAt).toISOString() : "—";
    const status = j.enabled ? "✔" : "✖";
    return `${status} ${j.id} | ${j.name} | Next: ${nextRun} | Runs: ${j.runCount}`;
  });

  return { name: "cron_list", content: lines.join("\n"), isError: false };
}

function executeCronAdd(engine: any, args: Record<string, unknown>): ToolResult {
  if (!engine.cronEngine) return { name: "cron_add", content: "Cron engine not available", isError: true };
  const name = args.name as string;
  const kind = args.schedule_kind as string;
  const value = args.schedule_value as string;
  const command = args.command as string;

  if (!name || !kind || !value || !command) {
    return { name: "cron_add", content: "Error: name, schedule_kind, schedule_value, command required", isError: true };
  }

  let schedule: import("./cron-engine.js").CronSchedule;
  if (kind === "at") {
    schedule = { kind: "at", at: value };
  } else if (kind === "every") {
    schedule = { kind: "every", everyMs: parseInt(value, 10) };
  } else if (kind === "cron") {
    schedule = { kind: "cron", expr: value };
  } else {
    return { name: "cron_add", content: `Unknown schedule kind: ${kind}`, isError: true };
  }

  const job = engine.cronEngine.addJob({
    name,
    schedule,
    payload: { kind: "command", command },
  });

  return {
    name: "cron_add",
    content: `Job created: ${job.id}\nName: ${job.name}\nNext run: ${job.nextRunAt ? new Date(job.nextRunAt).toISOString() : "—"}`,
    isError: false,
  };
}

function executeCronRemove(engine: any, args: Record<string, unknown>): ToolResult {
  if (!engine.cronEngine) return { name: "cron_remove", content: "Cron engine not available", isError: true };
  const jobId = args.job_id as string;
  if (!jobId) return { name: "cron_remove", content: "Error: job_id required", isError: true };

  const removed = engine.cronEngine.removeJob(jobId);
  return {
    name: "cron_remove",
    content: removed ? `Job removed: ${jobId}` : `Job not found: ${jobId}`,
    isError: !removed,
  };
}

function executeSessionList(engine: any, args: Record<string, unknown>): ToolResult {
  if (!engine.sessionManager) return { name: "session_list", content: "Session manager not available", isError: true };
  const status = args.status as string | undefined;
  const sessions = engine.sessionManager.listSessions(
    status ? { status: status as import("./multi-session.js").SessionStatus } : undefined,
  );

  if (sessions.length === 0) {
    return { name: "session_list", content: "No sessions.", isError: false };
  }

  const lines = sessions.map(s => {
    const age = Math.round((Date.now() - s.createdAt) / 60_000);
    return `${s.status === "running" ? "🔥" : s.status === "completed" ? "✔" : "⏸"} ${s.id} | ${s.label} | ${s.status} | ${s.messageCount} msgs | ${age}min`;
  });

  return { name: "session_list", content: lines.join("\n"), isError: false };
}

function executeSessionSpawn(engine: any, args: Record<string, unknown>): ToolResult {
  if (!engine.sessionManager) return { name: "session_spawn", content: "Session manager not available", isError: true };
  const task = args.task as string;
  if (!task) return { name: "session_spawn", content: "Error: task required", isError: true };

  const label = (args.label as string) ?? `sub-${Date.now()}`;

  // Create a new session (not a sub-agent — no parent in tool context)
  const session = engine.sessionManager.createSession({ label, task });
  session.status = "running";
  session.persist();

  return {
    name: "session_spawn",
    content: `Session spawned: ${session.id}\nLabel: ${label}\nTask: ${task}`,
    isError: false,
  };
}

async function executeSemanticSearch(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) return { name: "semantic_search", content: "Error: query required", isError: true };

  const topK = (args.top_k as number) ?? 5;

  if (!engine.embeddingEngine.hasProvider()) {
    return {
      name: "semantic_search",
      content: "No embedding provider configured. Use local TF-IDF search via 'recall' instead.",
      isError: true,
    };
  }

  try {
    const results = await engine.embeddingEngine.search(query, topK);
    if (results.length === 0) {
      return { name: "semantic_search", content: "No matching documents found.", isError: false };
    }

    const lines = results.map(r =>
      `[${(r.score * 100).toFixed(0)}%] ${r.id}: ${r.text.slice(0, 200)}`,
    );
    return { name: "semantic_search", content: lines.join("\n\n"), isError: false };
  } catch (err) {
    return { name: "semantic_search", content: `Search error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
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

// ─── BROWSER TOOL EXECUTORS ─────────────────────────────────

async function executeBrowserNavigate(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) return { name: "browser_navigate", content: "Error: url is required", isError: true };

  try {
    const { BrowserEngine } = await import("./browser-engine.js");
    const browser = new BrowserEngine(engine.projectRoot ?? process.cwd());
    const result = await browser.navigate(url);
    return {
      name: "browser_navigate",
      content: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (err) {
    return { name: "browser_navigate", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

async function executeBrowserScreenshot(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) return { name: "browser_screenshot", content: "Error: url is required", isError: true };

  try {
    const { BrowserEngine } = await import("./browser-engine.js");
    const browser = new BrowserEngine(engine.projectRoot ?? process.cwd());
    const result = await browser.screenshot(url, {
      fullPage: args.full_page as boolean,
      selector: args.selector as string,
    });
    return {
      name: "browser_screenshot",
      content: `Screenshot saved: ${result.path} (${result.width}x${result.height}, ${Math.round(result.sizeBytes / 1024)}KB)\nBase64 length: ${result.base64.length}`,
      isError: false,
    };
  } catch (err) {
    return { name: "browser_screenshot", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

async function executeBrowserExtract(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) return { name: "browser_extract", content: "Error: url is required", isError: true };

  try {
    const { BrowserEngine } = await import("./browser-engine.js");
    const browser = new BrowserEngine(engine.projectRoot ?? process.cwd());
    const content = await browser.extractContent(url);
    const summary = [
      `Title: ${content.title}`,
      `URL: ${content.url}`,
      `Headings: ${content.headings.map(h => `${"#".repeat(h.level)} ${h.text}`).join(", ")}`,
      `Links: ${content.links.length}`,
      `Images: ${content.images.length}`,
      `Forms: ${content.forms.length}`,
      ``,
      `Text (first 2000 chars):`,
      content.text.slice(0, 2000),
    ].join("\n");
    return { name: "browser_extract", content: summary, isError: false };
  } catch (err) {
    return { name: "browser_extract", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

async function executeBrowserPdf(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  if (!url) return { name: "browser_pdf", content: "Error: url is required", isError: true };

  try {
    const { BrowserEngine } = await import("./browser-engine.js");
    const browser = new BrowserEngine(engine.projectRoot ?? process.cwd());
    const pdfPath = await browser.pdf(url, args.output_path as string);
    return { name: "browser_pdf", content: `PDF generated: ${pdfPath}`, isError: false };
  } catch (err) {
    return { name: "browser_pdf", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

// ─── MEMORY TOOL EXECUTORS ──────────────────────────────────

async function executeMemoryRead(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const key = args.key as string;
  if (!key) return { name: "memory_read", content: "Error: key is required", isError: true };

  try {
    const { IdentityEngine } = await import("./identity-engine.js");
    const identity = new IdentityEngine(engine.projectRoot ?? process.cwd());
    const value = identity.getMemory(key);
    return {
      name: "memory_read",
      content: value ? `${key}: ${value}` : `Key "${key}" not found in memory`,
      isError: false,
    };
  } catch (err) {
    return { name: "memory_read", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

async function executeMemoryWrite(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const key = args.key as string;
  const value = args.value as string;
  if (!key || !value) return { name: "memory_write", content: "Error: key and value are required", isError: true };

  try {
    const { IdentityEngine } = await import("./identity-engine.js");
    const identity = new IdentityEngine(engine.projectRoot ?? process.cwd());
    identity.updateMemory(key, value, args.section as string);
    return { name: "memory_write", content: `Saved: ${key} = ${value}`, isError: false };
  } catch (err) {
    return { name: "memory_write", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

async function executeMemorySearch(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) return { name: "memory_search", content: "Error: query is required", isError: true };

  try {
    const { IdentityEngine } = await import("./identity-engine.js");
    const identity = new IdentityEngine(engine.projectRoot ?? process.cwd());
    const results = identity.searchMemory(query);
    if (results.length === 0) return { name: "memory_search", content: "No matching memory entries found", isError: false };
    const formatted = results.map(r => `- **${r.key}:** ${r.value}${r.section ? ` [${r.section}]` : ""}`).join("\n");
    return { name: "memory_search", content: `Found ${results.length} entries:\n${formatted}`, isError: false };
  } catch (err) {
    return { name: "memory_search", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

// ─── SUB-AGENT TOOL EXECUTOR ────────────────────────────────

async function executeSpawnSubagent(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const task = args.task as string;
  if (!task) return { name: "spawn_subagent", content: "Error: task is required", isError: true };

  try {
    const { SubAgentEngine } = await import("./subagent-engine.js");
    const subAgents = engine.subAgents ?? new SubAgentEngine();
    const agent = await subAgents.spawn({
      task,
      role: args.role as string,
      label: args.label as string,
    });
    return {
      name: "spawn_subagent",
      content: `Sub-agent spawned: ${agent.label} (${agent.id})\nTask: ${task.slice(0, 100)}\nStatus: ${agent.status}`,
      isError: false,
    };
  } catch (err) {
    return { name: "spawn_subagent", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

// ─── DIFF TOOL EXECUTOR ─────────────────────────────────────

async function executeDiffPreview(engine: any, args: Record<string, unknown>): Promise<ToolResult> {
  const path = args.path as string;
  const newContent = args.new_content as string;
  if (!path || !newContent) return { name: "diff_preview", content: "Error: path and new_content are required", isError: true };

  try {
    const { generateDiff, formatColoredDiff } = await import("./diff-engine.js");
    const fs = await import("node:fs");
    const root = engine.projectRoot ?? process.cwd();
    const { resolve } = await import("node:path");
    const fullPath = resolve(root, path);

    let oldContent = "";
    try { oldContent = fs.readFileSync(fullPath, "utf-8"); } catch { /* new file */ }

    const diff = generateDiff(path, oldContent, newContent, root);
    const plain = diff.unified || `New file: ${path} (${newContent.split("\n").length} lines)`;

    return {
      name: "diff_preview",
      content: `+${diff.linesAdded} -${diff.linesRemoved} lines\n\n${plain}`,
      isError: false,
    };
  } catch (err) {
    return { name: "diff_preview", content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

// ─── FORGE PIPELINE TOOL ─────────────────────────────────────

async function executeForge(
  defaultProjectRoot: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const task = args.task as string;
    if (!task || task.trim().length < 5) {
      return {
        name: "forge_pipeline",
        content: "Error: Task description is too short. Provide a detailed description of what to build/fix.",
        isError: true,
      };
    }

    const projectRoot = (args.project_root as string) || defaultProjectRoot;

    // Dynamic import to avoid circular dependency
    const { Engine } = await import("./engine.js");
    const { Orchestrator } = await import("./orchestrator.js");
    const { basename } = await import("node:path");
    const { loadKimiKey: loadKimi } = await import("./kimi-provider.js");

    // Use Kimi model if API key is configured
    const kimiKey = loadKimi();
    const engineModel = kimiKey ? "kimi-k2.5" : undefined;

    const engine = new Engine({
      projectRoot,
      projectName: basename(projectRoot),
      model: engineModel,
    });

    // Bootstrap LLM providers — forge needs them for all 4 layers
    const { bootstrapProviders } = await import("./provider-bootstrap.js");
    bootstrapProviders(engine);

    if (engine.providers.size === 0) {
      return {
        name: "forge_pipeline",
        content: "Error: No LLM provider available. Run 'foreman login' or 'foreman setup' first.",
        isError: true,
      };
    }
    console.log(`[forge] ${engine.providers.size} provider(s) registered`);

    const orchestrator = new Orchestrator(engine);

    // Collect events for summary
    const events: string[] = [];
    orchestrator.on((event) => {
      switch (event.type) {
        case "phase_start":
          events.push(`▶ ${event.phase}: ${event.detail}`);
          break;
        case "phase_end":
          events.push(`✔ ${event.phase}: ${event.detail}`);
          break;
        case "block_detected":
          events.push(`⛔ BLOCK: ${event.reason}`);
          break;
        case "reflection":
          events.push(`🔍 Reflection (${event.atomCount} atoms): ${event.summary.slice(0, 100)}`);
          break;
      }
    });

    const result = await orchestrator.run(task);

    // Gather changed files via git
    let changedFiles = "";
    try {
      const gitStatus = engine.git.executor.gitStatus();
      if (!gitStatus.clean) {
        const files = [...(gitStatus.staged ?? []), ...(gitStatus.unstaged ?? [])];
        if (files.length > 0) {
          changedFiles = `\n--- Changed Files (${files.length}) ---\n${files.slice(0, 15).join("\n")}${files.length > 15 ? `\n... and ${files.length - 15} more` : ""}`;
        }
      }
    } catch { /* git not available */ }

    // Cost summary
    let costSummary = "";
    try {
      const report = engine.costTracker.formatReport();
      if (report) costSummary = `\n--- Cost ---\n${report.split("\n").slice(0, 3).join("\n")}`;
    } catch { /* best-effort */ }

    // Build summary
    const summary = [
      result.success ? "✅ Pipeline completed successfully" : "❌ Pipeline failed",
      `Thoughts: ${result.totalThoughts}`,
      `Tokens: ${result.totalTokens.toLocaleString()}`,
      result.blockedAt ? `Blocked at: ${result.blockedAt}` : "",
      changedFiles,
      costSummary,
      "",
      "--- Events ---",
      ...events.slice(-20), // Last 20 events
    ].filter(Boolean).join("\n");

    // Cleanup
    await engine.shutdown();

    return {
      name: "forge_pipeline",
      content: summary,
      isError: !result.success,
    };
  } catch (err) {
    return {
      name: "forge_pipeline",
      content: `Forge pipeline error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}
