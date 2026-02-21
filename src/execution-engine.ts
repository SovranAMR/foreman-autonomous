/**
 * FOREMAN — Execution Engine
 *
 * Enables the worker layer to do real-world work:
 * - File read / write / edit
 * - Shell command execution (build, test, lint)
 * - Git commit
 * - Project structure discovery
 *
 * Translates STEP6_EXECUTE instructions from the worker LLM
 * into real file operations through this engine.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { execSync } from "node:child_process";

// ─── TYPES ───────────────────────────────────────────────────

export interface FileOperation {
  type: "read" | "write" | "edit" | "create" | "delete";
  path: string;
  content?: string;
  /** edit: eski metin → yeni metin */
  oldText?: string;
  newText?: string;
}

export interface FileResult {
  success: boolean;
  path: string;
  content?: string;
  error?: string;
}

export interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProjectTree {
  files: string[];
  dirs: string[];
  total: number;
}

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
    "*.key",
    "*.pem",
  ];

  constructor(projectRoot: string, allowedPaths?: string[]) {
    this.projectRoot = projectRoot;
    this.allowedPaths = allowedPaths ?? ["src", "public", "components", "lib", "app", "pages", "styles", "test", "tests", "__tests__"];
  }

  // ─── PATH SECURITY ──────────────────────────────────────

  /**
   * Path security check — prevent escaping outside projectRoot.
   */
  private securePath(filePath: string): string {
    // If absolute path, use directly; if relative, join with projectRoot
    const resolved = filePath.startsWith("/")
      ? filePath
      : join(this.projectRoot, filePath);

    // Traversal check — don't escape outside projectRoot
    const rel = relative(this.projectRoot, resolved);
    if (rel.startsWith("..") || rel.startsWith("/")) {
      throw new Error(`Path traversal denied: ${filePath} resolves outside project root`);
    }

    // Denied path check
    for (const denied of this.deniedPaths) {
      if (denied.startsWith("*")) {
        // Glob: *.key → .key ile biten
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
   * Read file.
   */
  readFile(filePath: string): FileResult {
    try {
      const resolved = this.securePath(filePath);
      if (!existsSync(resolved)) {
        return { success: false, path: filePath, error: `File not found: ${filePath}` };
      }
      const content = readFileSync(resolved, "utf-8");
      return { success: true, path: filePath, content };
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
   * Toplu dosya operasyonu.
   */
  executeOperations(ops: FileOperation[]): FileResult[] {
    return ops.map(op => {
      switch (op.type) {
        case "read":
          return this.readFile(op.path);
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

  /**
   * Dosya sil.
   */
  deleteFile(filePath: string): FileResult {
    try {
      const resolved = this.securePath(filePath);
      if (!existsSync(resolved)) {
        return { success: true, path: filePath }; // zaten yok
      }
      unlinkSync(resolved);
      return { success: true, path: filePath };
    } catch (err: any) {
      return { success: false, path: filePath, error: err.message };
    }
  }

  // ─── SHELL COMMANDS ──────────────────────────────────────

  /**
   * Run shell command (build, test, lint, etc.)
   * Security: only in projectRoot, timeout 60s.
   */
  runShell(command: string, timeoutMs: number = 60_000): ShellResult {
    // Block dangerous commands
    const dangerous = ["rm -rf /", "sudo", "chmod 777", "curl | sh", "wget | sh"];
    for (const d of dangerous) {
      if (command.includes(d)) {
        return {
          success: false,
          stdout: "",
          stderr: `Dangerous command blocked: ${d}`,
          exitCode: -1,
        };
      }
    }

    try {
      const stdout = execSync(command, {
        cwd: this.projectRoot,
        timeout: timeoutMs,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024, // 1MB
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { success: true, stdout: stdout.trim(), stderr: "", exitCode: 0 };
    } catch (err: any) {
      return {
        success: false,
        stdout: err.stdout?.toString().trim() ?? "",
        stderr: err.stderr?.toString().trim() ?? err.message,
        exitCode: err.status ?? 1,
      };
    }
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
          // Skip
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
          } catch {
            // permission denied etc.
          }
        }
      } catch {
        // dir read error
      }
    };

    walk(this.projectRoot, 0);
    return { files, dirs, total: files.length + dirs.length };
  }

  /**
   * Dosyada pattern ara (grep benzeri).
   */
  searchInFiles(pattern: string, glob: string = "src/**/*.ts"): Array<{ file: string; line: number; text: string }> {
    try {
      const result = this.runShell(`grep -rn "${pattern.replace(/"/g, '\\"')}" --include="${glob}" .`, 10_000);
      if (!result.success || !result.stdout) return [];

      return result.stdout.split("\n").filter(l => l.length > 0).map(line => {
        const match = line.match(/^\.\/(.+?):(\d+):(.*)/);
        if (!match) return null;
        return { file: match[1], line: parseInt(match[2]), text: match[3].trim() };
      }).filter((r): r is { file: string; line: number; text: string } => r !== null).slice(0, 50);
    } catch {
      return [];
    }
  }

  // ─── GIT ─────────────────────────────────────────────────

  /**
   * Git commit (stage + commit given files).
   */
  gitCommit(message: string, files?: string[]): ShellResult {
    if (files && files.length > 0) {
      const fileArgs = files.map(f => `"${f}"`).join(" ");
      const addResult = this.runShell(`git add ${fileArgs}`);
      if (!addResult.success) return addResult;
    } else {
      const addResult = this.runShell("git add -A");
      if (!addResult.success) return addResult;
    }

    return this.runShell(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  /**
   * Git diff (unstaged changes).
   */
  gitDiff(): ShellResult {
    return this.runShell("git diff --stat");
  }
}
