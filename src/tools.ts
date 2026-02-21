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
 *   - edit_file: Edit specific parts of a file
 *   - search_files: Search for files by name/pattern
 *   - grep: Search file contents
 *   - list_dir: List directory contents
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
];

// ─── TOOL EXECUTOR ───────────────────────────────────────────

/**
 * Creates a tool executor bound to a project root via ExecutionEngine.
 * All file operations go through the engine's security checks.
 */
export function createToolExecutor(projectRoot: string): (call: ToolCall) => ToolResult {
  const engine = new ExecutionEngine(projectRoot);

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
          return executeEditFile(engine, call.args);
        case "search_files":
          return executeSearchFiles(projectRoot, call.args);
        case "grep":
          return executeGrep(projectRoot, call.args);
        case "list_dir":
          return executeListDir(projectRoot, call.args);
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

function executeEditFile(engine: ExecutionEngine, args: Record<string, unknown>): ToolResult {
  const filePath = args.path as string;
  const oldStr = args.old_string as string;
  const newStr = args.new_string as string;

  if (!filePath || oldStr === undefined || newStr === undefined) {
    return { name: "edit_file", content: "Error: path, old_string, and new_string are required", isError: true };
  }

  // Delegates to ExecutionEngine — gets path security,
  // exact match replacement for free
  const result = engine.editFile(filePath, oldStr, newStr);

  if (!result.success) {
    return { name: "edit_file", content: result.error ?? "Edit failed", isError: true };
  }

  return { name: "edit_file", content: `File edited: ${filePath}`, isError: false };
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
