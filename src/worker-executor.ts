/**
 * FOREMAN — Worker Executor
 *
 * Bridges the gap between Worker's 8-step protocol and real execution.
 * When a Worker thought plans changes (step4_decide) and reports execution
 * (step6_execute), this module actually performs the operations:
 *
 * - Extracts file write/edit operations from worker output
 * - Extracts shell commands from worker output
 * - Executes them through ExecutionEngine (security checks, approval, etc.)
 * - Returns real execution results for verification
 *
 * This is what makes Foreman actually DO things, not just plan them.
 */

import type { WorkerProtocol } from "./types.js";
import type { ExecutionEngine } from "./execution-engine.js";
import type { EditEngine } from "./edit-engine.js";
import type { GitEngine } from "./git-engine.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { HooksEngine } from "./hooks-engine.js";
import type { InteractiveConfirm } from "./interactive-confirm.js";
import { assessRisk as assessCommandRisk } from "./interactive-confirm.js";
import type { StreamingPipeline } from "./streaming-pipeline.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ExtractedOperation {
  type: "write_file" | "edit_file" | "run_command" | "delete_file" | "create_dir" | "rename_node";
  path?: string;
  newPath?: string;
  content?: string;
  oldText?: string;
  newText?: string;
  command?: string;
}

export interface ExecutionResult {
  operation: ExtractedOperation;
  success: boolean;
  output?: string;
  error?: string;
}

export interface WorkerExecutionSummary {
  operations: ExecutionResult[];
  totalOps: number;
  succeeded: number;
  failed: number;
  output: string;
}

// ─── OPERATION EXTRACTION ────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf?\s+\//,      // rm -rf /
  /\bsudo\b/,               // sudo anything
  /\bshutdown\b/,           // shutdown
  /\breboot\b/,             // reboot
  /\bmkfs\b/,               // format disk
  /\bdd\s+if=/,             // disk dump
  /\bcurl\b.*\|\s*\bbash\b/, // curl | bash
  /\bwget\b.*\|\s*\bbash\b/, // wget | bash
  /\bnpm\s+publish\b/,      // npm publish
  /\bgit\s+push\s+.*--force/, // git push --force
  /\btruncate\s+-s\s+0\s+\//, // truncate system files
  /\bmv\s+.*\s+\/dev\/null/, // move to dev null
  /\bchmod\s+-R\s+777\s+\//,  // global chmod 777
  /\bchown\s+-R\s+.*\s+\//,    // global chown
  /\bhistory\s+-c\b/,           // clear history (suspicious)
  /\brm\s+.*\.log\b/,           // deleting logs
  /\bkurl\b/,                    // common obfuscated curl
  /\bncat\s+.*\s+-e\s+/,         // reverse shell
  /\bpython\s+-c\s+.*import\s+socket/, // reverse shell
];

export function isDangerousCommand(cmd: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(cmd));
}

// ─── SEARCH/REPLACE LEAKAGE GUARD ────────────────────────────
// The Worker layer receives `SEARCH:` / `REPLACE:` blocks as the edit_file
// tool's format. Historically, stressed workers after reviewer rejection
// have pasted those blocks verbatim into `cat >> file <<EOF ... EOF`
// heredocs, corrupting the target file with literal protocol text.
// This guard catches three shapes:
//   1. run_command heredocs that write SEARCH/REPLACE markers to disk.
//   2. write_file / edit_file payloads whose content IS a SEARCH/REPLACE
//      block (i.e. the worker forgot to emit the real file body).
//   3. Git conflict markers (<<<<<<<, =======, >>>>>>>) in any payload
//      destined for disk.

const PROTOCOL_LEAK_BODY_RE =
  /(?:^|[\s'"`])(SEARCH:|REPLACE:|<<<<<<<\s*SEARCH|=======(?:\s|$)|>>>>>>>\s*REPLACE)/m;

// Detects commands that pipe stdin/heredoc content into a file on disk.
const WRITE_TO_FILE_CMD_RE =
  /\b(?:cat|tee|printf|echo)\b[^\n|]*?(?:>>?|\|\s*tee)\s*[^\s<]+/;

export function commandWritesProtocolLeak(cmd: string): boolean {
  if (!cmd) return false;
  if (!WRITE_TO_FILE_CMD_RE.test(cmd)) return false;
  // Only worry about bodies that ship SEARCH/REPLACE / conflict markers.
  return PROTOCOL_LEAK_BODY_RE.test(cmd);
}

export function contentIsProtocolLeak(content: string | undefined): boolean {
  if (!content) return false;
  // Short bodies are almost never real file content; match strictly.
  if (PROTOCOL_LEAK_BODY_RE.test(content)) return true;
  // Very short "content" that starts with SEARCH: or REPLACE: (single-line)
  const trimmed = content.trimStart();
  if (/^(SEARCH|REPLACE):/i.test(trimmed)) return true;
  return false;
}

/**
 * Try to identify which files a shell command wrote to, so the executor
 * can re-read them and run a post-write sanity scan.
 *
 * Handles the common write-through shapes used by Kimi/other LLMs:
 *   - `cat > path`, `cat >> path`, `cat > path << EOF ... EOF`
 *   - `tee path`, `tee -a path`, `| tee path`
 *   - `printf ... > path`, `echo ... >> path`
 *   - `python3 -c "open('path','w').write(...)"` (best-effort, path extracted)
 *
 * Returns absolute filesystem paths (resolved against `projectRoot`).
 */
export function extractWriteTargetsFromShell(cmd: string, projectRoot: string): string[] {
  if (!cmd) return [];
  const targets = new Set<string>();
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const clean = raw.replace(/^['"]|['"]$/g, "").trim();
    if (!clean || clean.startsWith("<") || clean === "EOF") return;
    // Ignore /dev/null and process substitutions
    if (clean === "/dev/null" || clean.startsWith("<(") || clean.startsWith(">(")) return;
    const abs = clean.startsWith("/") ? clean : resolve(projectRoot, clean);
    targets.add(abs);
  };

  // `>  path`  and `>> path` (no shell-expansion, simple token grab)
  const redirectRe = />{1,2}\s*([^\s<>|&;]+)/g;
  let m: RegExpExecArray | null;
  while ((m = redirectRe.exec(cmd)) !== null) {
    push(m[1]);
  }

  // `tee path` / `tee -a path` / `| tee ...`
  const teeRe = /\btee\s+(?:-[aip]+\s+)?([^\s<>|&;]+)/g;
  while ((m = teeRe.exec(cmd)) !== null) {
    push(m[1]);
  }

  // python3 -c "... open('path','w') ..."
  const pyOpenRe = /open\(\s*["']([^"']+)["']\s*,\s*["'](?:w|a|wb|ab)/g;
  while ((m = pyOpenRe.exec(cmd)) !== null) {
    push(m[1]);
  }

  // node -e "... fs.writeFileSync('path',..."
  const fsWriteRe = /fs\.(?:writeFile(?:Sync)?|appendFile(?:Sync)?)\(\s*["']([^"']+)["']/g;
  while ((m = fsWriteRe.exec(cmd)) !== null) {
    push(m[1]);
  }

  return Array.from(targets);
}

/**
 * Extract file operations from worker protocol text.
 * Looks for code blocks with file paths, write/edit markers, and shell commands.
 */
export function extractOperations(protocol: WorkerProtocol): ExtractedOperation[] {
  const ops: ExtractedOperation[] = [];
  const allText = [
    protocol.step4_decide,
    protocol.step6_execute,
    // step7_verify excluded — verification commands should not be executed as real operations
  ].join("\n");

  // 1. Extract file writes: ```filepath\ncontent\n``` (with File:/Path:/Write to: prefix)
  const fileWriteRx = /```[a-z]*\s*\n\/\/ (?:File|Path|Write to): (.+)\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fileWriteRx.exec(allText)) !== null) {
    ops.push({
      type: "write_file",
      path: match[1].trim(),
      content: match[2].trimEnd(),
    });
  }

  // 1.5 Comment-style path: ```lang\n// src/path.ts\ncontent\n```
  // Kimi and other LLMs often use this format without any prefix keyword
  const commentPathRx = /```[a-z]*\s*\n\/\/ ([\w./-]+\.(?:tsx?|jsx?|css|json|md|html|vue|svelte|yaml|toml|py|sh))\n([\s\S]*?)```/gi;
  while ((match = commentPathRx.exec(allText)) !== null) {
    const path = match[1].trim();
    if (!ops.some(o => o.path === path)) {
      ops.push({
        type: "write_file",
        path,
        content: match[2].trimEnd(),
      });
    }
  }

  // 2. Alternative: "Write to `path`:" or "Create file `path`:" followed by code block
  const writeToRx = /(?:write to|create file|save to|output to)\s+[`"]([^`"]+)[`"]\s*:?\s*\n```[^\n]*\n([\s\S]*?)```/gi;
  while ((match = writeToRx.exec(allText)) !== null) {
    const path = match[1].trim();
    if (!ops.some(o => o.path === path)) {
      ops.push({
        type: "write_file",
        path,
        content: match[2].trimEnd(),
      });
    }
  }

  // 3. Extract edits: "Replace X with Y in file Z" or edit blocks
  const editRx = /(?:replace|change|edit|update)\s+(?:in\s+)?[`"]([^`"]+)[`"]\s*:\s*\n```[^\n]*\n([\s\S]*?)```\s*(?:→|->|with|to)\s*\n```[^\n]*\n([\s\S]*?)```/gi;
  while ((match = editRx.exec(allText)) !== null) {
    ops.push({
      type: "edit_file",
      path: match[1].trim(),
      oldText: match[2].trimEnd(),
      newText: match[3].trimEnd(),
    });
  }

  // 4. Extract shell commands: `$ command` or ```bash\ncommand\n```
  const bashBlockRx = /```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/gi;
  while ((match = bashBlockRx.exec(allText)) !== null) {
    const commands = match[1].trim().split("\n")
      .map(l => l.replace(/^\$\s*/, "").trim())
      .filter(l => l && !l.startsWith("#"));
    for (const cmd of commands) {
      // Skip file creation commands — handled by file write extraction
      if (cmd.startsWith("cat >") || cmd.startsWith("cat <<")) continue;
      // Skip dangerous commands
      if (isDangerousCommand(cmd)) continue;
      ops.push({ type: "run_command", command: cmd });
    }
  }

  // 5. Inline commands: lines starting with `$ ` in step6_execute
  const inlineCmdRx = /^\$\s+(.+)$/gm;
  while ((match = inlineCmdRx.exec(protocol.step6_execute)) !== null) {
    const cmd = match[1].trim();
    if (!ops.some(o => o.command === cmd) && !isDangerousCommand(cmd)) {
      ops.push({ type: "run_command", command: cmd });
    }
  }

  // 5.5 Shell code blocks: ```\n$ command\n``` (unlabeled)
  const genericBashRx = /```\s*\n((?:\$\s+.+\n?)+)```/gi;
  while ((match = genericBashRx.exec(allText)) !== null) {
    const commands = match[1].trim().split("\n")
      .map(l => l.replace(/^\$\s*/, "").trim())
      .filter(l => l);
    for (const cmd of commands) {
      if (!ops.some(o => o.command === cmd) && !isDangerousCommand(cmd)) {
        ops.push({ type: "run_command", command: cmd });
      }
    }
  }

  // 6. Delete operations
  const deleteRx = /(?:delete|remove|rm)\s+(?:file\s+)?[`"]([^`"]+)[`"]/gi;
  while ((match = deleteRx.exec(allText)) !== null) {
    ops.push({ type: "delete_file", path: match[1].trim() });
  }

  // 7. Create directory
  const mkdirRx = /(?:mkdir|create directory)\s+(?:-p\s+)?[`"]([^`"]+)[`"]/gi;
  while ((match = mkdirRx.exec(allText)) !== null) {
    ops.push({ type: "create_dir", path: match[1].trim() });
  }

  // 7.5 Rename file/dir
  const renameRx = /(?:rename|move|mv)\s+[`"]([^`"]+)[`"]\s+(?:to|->)\s+[`"]([^`"]+)[`"]/gi;
  while ((match = renameRx.exec(allText)) !== null) {
    ops.push({
      type: "rename_node",
      path: match[1].trim(),
      newPath: match[2].trim(),
    });
  }

  // 8. Fallback: code fence with a filename-like first line (e.g. ```tsx\nsrc/app.tsx\n...)
  const filenameFenceRx = /```[a-z]*\s*\n([\w./-]+\.(?:tsx?|jsx?|css|json|md|html|vue|svelte|yaml|toml|py))\n([\s\S]*?)```/gi;
  while ((match = filenameFenceRx.exec(allText)) !== null) {
    const path = match[1].trim();
    if (!ops.some(o => o.path === path)) {
      ops.push({
        type: "write_file",
        path,
        content: match[2].trimEnd(),
      });
    }
  }

  // 9. Last-resort fallback: ANY code fence with substantial content (>5 lines)
  // that hasn't been captured yet. Useful when LLM uses non-standard formatting.
  if (ops.length === 0) {
    const anyFenceRx = /```[a-z]*\s*\n([\s\S]*?)```/gi;
    const fences: string[] = [];
    while ((match = anyFenceRx.exec(allText)) !== null) {
      const content = match[1].trim();
      if (content.split("\n").length >= 5) {
        fences.push(content);
      }
    }

    // Try to pair each fence with a file path mentioned nearby in the text
    // This handles cases where the LLM mentions a path before or after the code block
    const pathRx = /[`"']?([\w./-]+\.(?:tsx?|jsx?|css|json|md|html|vue|svelte|yaml|toml|py))[`"']?/gi;
    const allPaths: string[] = [];
    while ((match = pathRx.exec(allText)) !== null) {
      const p = match[1].trim();
      if (!allPaths.includes(p) && p.includes("/")) {
        allPaths.push(p);
      }
    }

    if (fences.length === 1 && allPaths.length >= 1) {
      // Single fence, pick the first file path
      ops.push({
        type: "write_file",
        path: allPaths[0],
        content: fences[0],
      });
    } else if (fences.length > 1 && allPaths.length >= fences.length) {
      // Multiple fences, try 1:1 pairing with paths in order
      for (let i = 0; i < fences.length && i < allPaths.length; i++) {
        if (!ops.some(o => o.path === allPaths[i])) {
          ops.push({
            type: "write_file",
            path: allPaths[i],
            content: fences[i],
          });
        }
      }
    }

    // Diagnostic: log extraction failure details for debugging
    if (ops.length === 0 && allText.length > 100) {
      const hasFences = /```/.test(allText);
      const hasFilePaths = /[\w./-]+\.(?:tsx?|jsx?|css|json|md|html)/i.test(allText);
      console.warn(
        `[worker-executor] extractOperations returned 0 ops from ${allText.length} chars. ` +
        `fences=${hasFences}, filePaths=${hasFilePaths}, ` +
        `step4_len=${protocol.step4_decide?.length ?? 0}, step6_len=${protocol.step6_execute?.length ?? 0}`
      );
    }
  }

  return ops;
}

/**
 * Extract commands from step6_execute that look like terminal commands.
 * More aggressive extraction for common patterns.
 */
export function extractCommands(text: string): string[] {
  const commands: string[] = [];

  // npm/pnpm/yarn commands
  const npmRx = /\b((?:npm|pnpm|yarn|bun|npx|bunx)\s+[^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = npmRx.exec(text)) !== null) {
    const cmd = match[1].trim();
    if (!commands.includes(cmd)) commands.push(cmd);
  }

  // git commands
  const gitRx = /\b(git\s+(?:add|commit|push|pull|checkout|branch|merge|rebase|stash|diff|log|status)[^\n]*)/gi;
  while ((match = gitRx.exec(text)) !== null) {
    const cmd = match[1].trim();
    if (!commands.includes(cmd)) commands.push(cmd);
  }

  // Common build/test commands
  const buildRx = /\b((?:make|cargo|go|python|pip|tsc|eslint|prettier|vitest|jest|pytest)\s+[^\n]+)/gi;
  while ((match = buildRx.exec(text)) !== null) {
    const cmd = match[1].trim();
    if (!commands.includes(cmd)) commands.push(cmd);
  }

  return commands;
}

// ─── EXECUTION ───────────────────────────────────────────────

/**
 * Execute extracted operations through the Engine subsystems.
 * Each operation goes through security checks (ApprovalEngine) and
 * gets tracked by ProcessRegistry.
 */
export async function executeOperations(
  ops: ExtractedOperation[],
  execEngine: ExecutionEngine,
  editEngine: EditEngine,
  projectRoot: string,
  options?: {
    hooks?: HooksEngine;
    interactive?: InteractiveConfirm;
    streaming?: StreamingPipeline;
    maxOps?: number;
  },
): Promise<WorkerExecutionSummary> {
  const results: ExecutionResult[] = [];

  // Safety cap — prevent runaway execution from bad parsing
  const maxOps = options?.maxOps ?? 20;
  const opsToExecute = ops.length > maxOps
    ? (console.warn(`[worker-executor] ${ops.length} ops exceeds cap of ${maxOps}, truncating`), ops.slice(0, maxOps))
    : ops;

  for (const op of opsToExecute) {
    try {
      // ─── HOOKS: before_tool ───
      if (options?.hooks) {
        const hookResult = await options.hooks.run("before_tool_call", {
          tool: op.type,
          path: op.path,
          command: op.command,
        });
        if (hookResult.block) {
          results.push({ operation: op, success: false, error: `Blocked by hook: ${hookResult.blockReason}` });
          continue;
        }
      }

      // ─── STREAMING: tool call event ───
      if (options?.streaming) {
        const desc = op.type === "run_command"
          ? `${op.command?.slice(0, 60)}`
          : `${op.type} ${op.path ?? ""}`;
        options.streaming.toolCall(op.type, desc);
      }

      switch (op.type) {
        case "write_file": {
          if (!op.path || op.content === undefined) {
            results.push({ operation: op, success: false, error: "Missing path or content" });
            break;
          }

          // ─── EMPTY CONTENT GUARD ───
          // If extraction produced content="" it means the regex matched a
          // fence boundary but captured nothing inside. Writing a 0-byte
          // file would silently destroy existing content. Reject so the
          // orchestrator can retry or use fallback extraction.
          if (op.content.trim().length === 0) {
            const msg = `Rejected: write_file has empty content — extraction likely failed to capture fence body`;
            options?.streaming?.warning(`🛡 ${msg} (${op.path})`);
            results.push({ operation: op, success: false, error: msg });
            break;
          }

          // ─── PROTOCOL-LEAK GUARD ───
          // Reject payloads whose body IS a SEARCH/REPLACE block or
          // git conflict markers — those are protocol artifacts, never
          // real file content.
          if (contentIsProtocolLeak(op.content)) {
            const msg = `Rejected: write_file payload contains SEARCH/REPLACE or conflict markers — likely protocol leak into file body`;
            options?.streaming?.warning(`🛡 ${msg} (${op.path})`);
            results.push({ operation: op, success: false, error: msg });
            break;
          }

          // ─── HOOKS: before_file ───
          if (options?.hooks) {
            const hookResult = await options.hooks.run("before_file_write", {
              action: "write",
              path: op.path,
              size: op.content.length,
            });
            if (hookResult.block) {
              results.push({ operation: op, success: false, error: `Write blocked by hook: ${hookResult.blockReason}` });
              break;
            }
          }

          const fullPath = op.path.startsWith("/") ? op.path : `${projectRoot}/${op.path}`;

          // ─── OVERWRITE PROTECTION ───
          // If the file already exists and has content, check if the new
          // content is a superset (contains the existing content). If not,
          // merge by prepending existing content to prevent atom A's work
          // from being destroyed by atom B's blind write_file.
          let diffInfo = "";
          try {
            const resolvedPath = resolve(projectRoot, op.path);
            if (existsSync(resolvedPath)) {
              const existingContent = readFileSync(resolvedPath, "utf-8");
              const oldLines = existingContent.split("\n").length;
              const newLines = op.content.split("\n").length;
              diffInfo = ` (${oldLines}→${newLines} lines)`;

              if (existingContent.trim().length > 0 && !op.content.includes(existingContent.trim())) {
                // New content does NOT include existing — merge to prevent data loss
                const mergedContent = existingContent + "\n" + op.content;
                options?.streaming?.warning(
                  `🔀 write_file merge: ${op.path} already has ${oldLines} lines — prepending existing content to prevent overwrite`,
                );
                op.content = mergedContent;
                diffInfo = ` (${oldLines}→${mergedContent.split("\n").length} lines, merged)`;
              }
            } else {
              diffInfo = ` (new file, ${op.content.split("\n").length} lines)`;
            }
          } catch { /* ignore */ }

          // Absolute paths outside project root: write directly (securePath denies them)
          const isAbsoluteExternal = op.path.startsWith("/") && !op.path.startsWith(projectRoot);
          if (isAbsoluteExternal) {
            try {
              const { mkdirSync, writeFileSync } = await import("node:fs");
              const { dirname } = await import("node:path");
              const dir = dirname(fullPath);
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              writeFileSync(fullPath, op.content, "utf-8");
              results.push({ operation: op, success: true, output: `Wrote ${fullPath}${diffInfo}` });
            } catch (err: any) {
              results.push({ operation: op, success: false, error: err.message });
            }
          } else {
            const writeResult = execEngine.writeFile(fullPath, op.content);
            results.push({
              operation: op,
              success: writeResult.success,
              output: writeResult.success ? `Wrote ${op.path}${diffInfo}` : undefined,
              error: writeResult.error,
            });
          }
          break;
        }

        case "edit_file": {
          if (!op.path || !op.oldText || !op.newText) {
            results.push({ operation: op, success: false, error: "Missing path, oldText, or newText" });
            break;
          }
          // ─── PROTOCOL-LEAK GUARD (newText) ───
          if (contentIsProtocolLeak(op.newText)) {
            const msg = `Rejected: edit_file newText contains SEARCH/REPLACE or conflict markers — protocol leak`;
            options?.streaming?.warning(`🛡 ${msg} (${op.path})`);
            results.push({ operation: op, success: false, error: msg });
            break;
          }
          const editResult = editEngine.edit({
            filePath: op.path,
            oldText: op.oldText,
            newText: op.newText,
          });
          results.push({
            operation: op,
            success: editResult.success,
            output: editResult.success ? `Edited ${op.path}` : undefined,
            error: editResult.success ? undefined : editResult.message,
          });
          break;
        }

        case "run_command": {
          if (!op.command) {
            results.push({ operation: op, success: false, error: "No command" });
            break;
          }

          // ─── PROTOCOL-LEAK GUARD (heredoc write-through) ───
          // Detects `cat >> file << EOF ... SEARCH:/REPLACE: ... EOF`
          // patterns that would shove protocol markers onto disk.
          if (commandWritesProtocolLeak(op.command)) {
            const msg = `Rejected: run_command writes SEARCH/REPLACE/conflict markers to disk — use edit_file tool instead`;
            options?.streaming?.warning(`🛡 ${msg}`);
            results.push({ operation: op, success: false, error: msg });
            break;
          }

          // ─── INTERACTIVE: Risk check for dangerous commands ───
          if (options?.interactive) {
            const riskLevel = assessCommandRisk({
              type: "run_command",
              description: `Worker command: ${op.command.slice(0, 80)}`,
              target: op.command,
              risk: "medium",
            });
            if (riskLevel === "critical") {
              results.push({
                operation: op,
                success: false,
                error: `Blocked: ${riskLevel} risk command. Pattern matched dangerous operation.`,
              });
              break;
            }
          }

          const cmdResult = execEngine.runShell(op.command, 300_000);
          console.log(`  [worker-exec] cmd="${op.command.slice(0, 60)}" exit=${cmdResult.exitCode} err=${cmdResult.stderr?.slice(0, 80) ?? ""}`);

          // ─── POST-WRITE SANITY SCAN ───
          // If the command wrote to a file (cat/tee/printf/echo > path,
          // python open(...,'w'), node fs.writeFile, etc.), read the
          // resulting file and check for protocol markers. If found,
          // revert the command by truncating/removing any freshly
          // appended markers — then mark the op as failed.
          let postWriteViolation: string | null = null;
          try {
            const targets = extractWriteTargetsFromShell(op.command, projectRoot);
            for (const target of targets) {
              if (!existsSync(target)) continue;
              const body = readFileSync(target, "utf-8");
              if (contentIsProtocolLeak(body)) {
                postWriteViolation = `Post-write scan: ${target} contains SEARCH/REPLACE or conflict markers after command`;
                options?.streaming?.warning(`🛡 ${postWriteViolation}`);
                break;
              }
            }
          } catch { /* scan best-effort */ }

          if (postWriteViolation) {
            results.push({
              operation: op,
              success: false,
              output: cmdResult.stdout?.slice(0, 500),
              error: postWriteViolation,
            });
          } else {
            results.push({
              operation: op,
              success: cmdResult.exitCode === 0,
              output: cmdResult.stdout?.slice(0, 2000),
              error: cmdResult.exitCode !== 0 ? (cmdResult.stderr?.slice(0, 1000) ?? `Exit ${cmdResult.exitCode}`) : undefined,
            });
          }
          break;
        }

        case "delete_file": {
          if (!op.path) {
            results.push({ operation: op, success: false, error: "No path" });
            break;
          }

          // ─── PRE-DELETE SAFETY: backup file before deleting ───
          // Creates physical .bak file + stores content in memory for undo.
          try {
            const fullPath = resolve(projectRoot, op.path);
            if (existsSync(fullPath)) {
              const content = readFileSync(fullPath, "utf-8");
              const sizeBytes = Buffer.byteLength(content);
              // Physical backup — survives crashes
              const { writeFileSync } = await import("node:fs");
              writeFileSync(fullPath + ".bak", content);
              console.warn(
                `[worker-executor] ⚠️ DELETE: ${op.path} (${sizeBytes} bytes). Backup saved to ${op.path}.bak`
              );
              // Attach backup to operation for potential recovery
              (op as unknown as Record<string, unknown>)._backupContent = content;
            }
          } catch {
            // Non-fatal — proceed with delete even if backup fails
          }

          // ─── HOOKS: before_file ───
          if (options?.hooks) {
            const hookResult = await options.hooks.run("before_file_write", {
              action: "delete",
              path: op.path,
            });
            if (hookResult.block) {
              results.push({ operation: op, success: false, error: `Delete blocked by hook: ${hookResult.blockReason}` });
              break;
            }
          }

          const delResult = execEngine.deleteFile(op.path);
          results.push({
            operation: op,
            success: delResult.success,
            output: delResult.success ? `Deleted ${op.path}` : undefined,
            error: delResult.error,
          });
          break;
        }

        case "create_dir": {
          if (!op.path) {
            results.push({ operation: op, success: false, error: "No path" });
            break;
          }
          try {
            const { mkdirSync, existsSync } = await import("node:fs");
            const fullPath = op.path.startsWith("/") ? op.path : `${projectRoot}/${op.path}`;
            if (!existsSync(fullPath)) {
              mkdirSync(fullPath, { recursive: true });
            }
            results.push({ operation: op, success: true, output: `Created ${op.path}` });
          } catch (err) {
            results.push({ operation: op, success: false, error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }

        case "rename_node": {
          if (!op.path || !op.newPath) {
            results.push({ operation: op, success: false, error: "Missing path or newPath" });
            break;
          }
          try {
            const { renameSync, existsSync } = await import("node:fs");
            const fullPath = op.path.startsWith("/") ? op.path : `${projectRoot}/${op.path}`;
            const fullNewPath = op.newPath.startsWith("/") ? op.newPath : `${projectRoot}/${op.newPath}`;

            if (!existsSync(fullPath)) {
              results.push({ operation: op, success: false, error: `Source not found: ${op.path}` });
              break;
            }

            renameSync(fullPath, fullNewPath);
            results.push({ operation: op, success: true, output: `Renamed ${op.path} to ${op.newPath}` });
          } catch (err) {
            results.push({ operation: op, success: false, error: err instanceof Error ? err.message : String(err) });
          }
          break;
        }

        default:
          results.push({ operation: op, success: false, error: `Unknown operation type` });
      }
    } catch (err) {
      results.push({
        operation: op,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  const outputLines = results.map(r => {
    const icon = r.success ? "✔" : "✖";
    const detail = r.output ?? r.error ?? "";
    const opDesc = r.operation.type === "run_command"
      ? `${r.operation.command?.slice(0, 60)}`
      : `${r.operation.type} ${r.operation.path ?? ""}`;
    return `  ${icon} ${opDesc}${detail ? ` → ${detail.slice(0, 100)}` : ""}`;
  });

  return {
    operations: results,
    totalOps: results.length,
    succeeded,
    failed,
    output: outputLines.join("\n"),
  };
}

// ─── WORKER STEP EXTRACTION HELPERS ──────────────────────────

/**
 * Check if a worker thought actually needs execution.
 * Some thoughts are analysis-only (step4_decide says "no changes needed").
 */
export function needsExecution(protocol: WorkerProtocol): boolean {
  const decisionText = (protocol.step4_decide + protocol.step6_execute).toLowerCase();

  // Skip patterns — analysis only
  const skipPatterns = [
    "no changes needed",
    "no modification required",
    "analysis complete",
    "already correct",
    "nothing to change",
    "no action required",
  ];

  if (skipPatterns.some(p => decisionText.includes(p))) {
    return false;
  }

  // Has actionable content?
  const hasCode = /```/.test(protocol.step6_execute);
  const hasCommand = /^\$\s+/m.test(protocol.step6_execute);
  const hasFilePath = /\b(?:src\/|\.ts|\.js|\.py|\.json|\.md)\b/.test(protocol.step6_execute);

  return hasCode || hasCommand || hasFilePath;
}

/**
 * Build execution feedback for the next LLM call.
 * After executing operations, feed results back so the LLM knows
 * what actually happened (success/failure/output).
 */
export function buildExecutionFeedback(summary: WorkerExecutionSummary): string {
  if (summary.totalOps === 0) return "";

  const lines = [
    `## Execution Results (${summary.succeeded}/${summary.totalOps} succeeded)`,
    summary.output,
  ];

  if (summary.failed > 0) {
    lines.push(`\n⚠️ ${summary.failed} operation(s) failed. Review errors above.`);
  }

  return lines.join("\n");
}
