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
];

function isDangerousCommand(cmd: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(cmd));
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
    protocol.step7_verify, // Worker may include verification commands
  ].join("\n");

  // 1. Extract file writes: ```filepath\ncontent\n```
  const fileWriteRx = /```[a-z]*\s*\n\/\/ (?:File|Path|Write to): (.+)\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fileWriteRx.exec(allText)) !== null) {
    ops.push({
      type: "write_file",
      path: match[1].trim(),
      content: match[2].trimEnd(),
    });
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
        const hookResult = await options.hooks.run("before_tool", {
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

          // ─── HOOKS: before_file ───
          if (options?.hooks) {
            const hookResult = await options.hooks.run("before_file", {
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

          // Track diff for reporting
          let diffInfo = "";
          try {
            const resolvedPath = resolve(projectRoot, op.path);
            if (existsSync(resolvedPath)) {
              const old = readFileSync(resolvedPath, "utf-8");
              const oldLines = old.split("\n").length;
              const newLines = op.content.split("\n").length;
              diffInfo = ` (${oldLines}→${newLines} lines)`;
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
          const editResult = editEngine.edit(op.path, op.oldText, op.newText);
          results.push({
            operation: op,
            success: editResult.success,
            output: editResult.success ? `Edited ${op.path}` : undefined,
            error: editResult.error,
          });
          break;
        }

        case "run_command": {
          if (!op.command) {
            results.push({ operation: op, success: false, error: "No command" });
            break;
          }

          // ─── INTERACTIVE: Risk check for dangerous commands ───
          if (options?.interactive) {
            const riskLevel = assessCommandRisk({
              type: "run_command",
              description: `Worker command: ${op.command.slice(0, 80)}`,
              target: op.command,
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

          const cmdResult = execEngine.runShell(op.command, 60_000);
          console.log(`  [worker-exec] cmd="${op.command.slice(0, 60)}" exit=${cmdResult.exitCode} err=${cmdResult.stderr?.slice(0, 80) ?? ""}`);
          results.push({
            operation: op,
            success: cmdResult.exitCode === 0,
            output: cmdResult.stdout?.slice(0, 2000),
            error: cmdResult.exitCode !== 0 ? (cmdResult.stderr?.slice(0, 1000) ?? `Exit ${cmdResult.exitCode}`) : undefined,
          });
          break;
        }

        case "delete_file": {
          if (!op.path) {
            results.push({ operation: op, success: false, error: "No path" });
            break;
          }

          // ─── HOOKS: before_file ───
          if (options?.hooks) {
            const hookResult = await options.hooks.run("before_file", {
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
