/**
 * FOREMAN — Worker Output Validator
 *
 * Validates worker claims against physical reality.
 * Worker says "I created src/foo.ts" → we check it actually exists.
 * Worker says "tests pass" → we actually run them.
 * Worker says "no errors" → we actually compile.
 *
 * This is the bullshit detector. LLM claims mean nothing without evidence.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { ExecutionEngine } from "./execution-engine.js";
import type { WorkerProtocol } from "./types.js";
import type { WorkerExecutionSummary, ExecutionResult } from "./worker-executor.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  score: number; // 0.0 - 1.0
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: "critical" | "warning" | "info";
}

// ─── VALIDATOR ───────────────────────────────────────────────

/**
 * Validate worker output against physical reality.
 * Returns a score 0.0-1.0 with detailed check results.
 */
export function validateWorkerOutput(
  protocol: WorkerProtocol,
  execSummary: WorkerExecutionSummary | null,
  executor: ExecutionEngine,
  projectRoot: string,
): ValidationResult {
  const checks: ValidationCheck[] = [];

  // ─── CHECK 1: Files mentioned in output actually exist ─────
  const mentionedFiles = extractMentionedFiles(protocol);
  if (mentionedFiles.created.length > 0) {
    for (const file of mentionedFiles.created) {
      const fullPath = resolve(projectRoot, file);
      const exists = existsSync(fullPath);
      checks.push({
        name: `file_exists:${file}`,
        passed: exists,
        detail: exists
          ? `✅ ${file} exists (${formatSize(fullPath)})`
          : `❌ ${file} claimed created but does NOT exist`,
        severity: "critical",
      });
    }
  }

  // ─── CHECK 2: Modified files have actual changes ───────────
  if (mentionedFiles.modified.length > 0) {
    try {
      const gitDiff = executor.runShell("git diff --name-only HEAD 2>/dev/null || git diff --name-only", 10_000);
      const changedFiles = gitDiff.stdout.trim().split("\n").filter(Boolean);
      const stagedDiff = executor.runShell("git diff --name-only --cached 2>/dev/null", 10_000);
      const stagedFiles = stagedDiff.stdout.trim().split("\n").filter(Boolean);
      const allChanged = new Set([...changedFiles, ...stagedFiles]);

      for (const file of mentionedFiles.modified) {
        const hasChange = allChanged.has(file) || allChanged.has(relative(projectRoot, resolve(projectRoot, file)));
        checks.push({
          name: `file_modified:${file}`,
          passed: hasChange,
          detail: hasChange
            ? `✅ ${file} has real changes in git`
            : `⚠️ ${file} claimed modified but no git diff found`,
          severity: "warning",
        });
      }
    } catch {
      checks.push({
        name: "git_diff_check",
        passed: true,
        detail: "⚠️ Could not run git diff — skipping modification check",
        severity: "info",
      });
    }
  }

  // ─── CHECK 3: Execution results match claims ──────────────
  if (execSummary) {
    // Worker claimed operations succeeded — verify they actually did
    const failedOps = execSummary.operations.filter(op => !op.success);
    if (failedOps.length > 0) {
      for (const op of failedOps) {
        checks.push({
          name: `exec_failed:${op.operation.type}`,
          passed: false,
          detail: `❌ ${op.operation.type} on ${op.operation.path ?? op.operation.command?.slice(0, 40)} failed: ${op.error?.slice(0, 100)}`,
          severity: "critical",
        });
      }
    }

    // Check written files have non-empty content
    const writeOps = execSummary.operations.filter(
      op => op.success && (op.operation.type === "write_file" || op.operation.type === "edit_file")
    );
    for (const op of writeOps) {
      if (op.operation.path) {
        const fullPath = resolve(projectRoot, op.operation.path);
        if (existsSync(fullPath)) {
          const size = statSync(fullPath).size;
          checks.push({
            name: `file_content:${op.operation.path}`,
            passed: size > 0,
            detail: size > 0
              ? `✅ ${op.operation.path} has content (${formatBytes(size)})`
              : `❌ ${op.operation.path} is empty (0 bytes)`,
            severity: size > 0 ? "info" : "critical",
          });
        }
      }
    }
  }

  // ─── CHECK 4: Build still works ────────────────────────────
  try {
    const buildResult = executor.runShell(
      "npm run build --if-present 2>&1 | tail -20",
      30_000,
    );
    const hasError = /error TS\d+|SyntaxError|Cannot find|TypeError/i.test(
      buildResult.stdout + buildResult.stderr,
    );
    checks.push({
      name: "build_check",
      passed: !hasError && buildResult.exitCode === 0,
      detail: hasError
        ? `❌ Build has errors after worker changes`
        : `✅ Build passes`,
      severity: "critical",
    });
  } catch {
    checks.push({
      name: "build_check",
      passed: true,
      detail: "⚠️ No build script — skipped",
      severity: "info",
    });
  }

  // ─── CHECK 5: Tests still pass ─────────────────────────────
  try {
    const testResult = executor.runShell(
      "npm test 2>&1 | tail -30",
      60_000,
    );
    const hasFailure = /fail|FAIL|✖|Error:|AssertionError/i.test(
      testResult.stdout + testResult.stderr,
    );
    const passMatch = (testResult.stdout + testResult.stderr).match(/(\d+)\s+pass/i);
    const failMatch = (testResult.stdout + testResult.stderr).match(/(\d+)\s+fail/i);
    const passCount = passMatch ? parseInt(passMatch[1]) : 0;
    const failCount = failMatch ? parseInt(failMatch[1]) : 0;

    checks.push({
      name: "test_check",
      passed: !hasFailure || failCount === 0,
      detail: failCount > 0
        ? `❌ ${failCount} tests failing after worker changes`
        : passCount > 0
          ? `✅ ${passCount} tests passing`
          : `✅ Tests pass (no failures detected)`,
      severity: "critical",
    });
  } catch {
    checks.push({
      name: "test_check",
      passed: true,
      detail: "⚠️ No test script — skipped",
      severity: "info",
    });
  }

  // ─── CHECK 6: Worker's step7_verify claims vs reality ──────
  if (protocol.step7_verify) {
    const claimsSuccess = /✅|pass|success|works|verified|confirmed/i.test(protocol.step7_verify);
    const claimsFailure = /❌|fail|error|broken|crash/i.test(protocol.step7_verify);
    const hasEvidence = /```|output:|result:|exit code|$ /i.test(protocol.step7_verify);

    if (claimsSuccess && !hasEvidence) {
      checks.push({
        name: "verify_evidence",
        passed: false,
        detail: `⚠️ Worker claims success but provides NO evidence (no command output, no test results)`,
        severity: "warning",
      });
    } else if (hasEvidence) {
      checks.push({
        name: "verify_evidence",
        passed: true,
        detail: `✅ Worker provides evidence in step7_verify`,
        severity: "info",
      });
    }

    if (claimsFailure) {
      checks.push({
        name: "worker_self_report_fail",
        passed: false,
        detail: `❌ Worker itself reports failure in step7_verify`,
        severity: "critical",
      });
    }
  }

  // ─── CHECK 7: Phantom work detection ──────────────────────
  // Worker claims to have written/created files in step6 but
  // extractOperations found 0 ops AND no tool calls were made.
  // This catches the "I wrote the file" hallucination pattern.
  if (protocol.step6_execute) {
    const claimsWrite = /(?:created?|wrote|written|added|saved)\s+(?:the\s+)?(?:file|component|module)/i.test(protocol.step6_execute);
    const hasCodeBlock = /```[\s\S]*?```/.test(protocol.step6_execute);
    const hasWriteMarker = /\/\/\s*(?:Write to|Path|File):/i.test(protocol.step6_execute);
    const hasShellCmd = /^\s*\$/m.test(protocol.step6_execute);

    if (claimsWrite && !hasCodeBlock && !hasWriteMarker && !hasShellCmd) {
      checks.push({
        name: "phantom_work",
        passed: false,
        detail: `❌ PHANTOM WORK: Worker claims to have written files but STEP6 contains no code blocks, no file markers, no commands. This is a hallucination.`,
        severity: "critical",
      });
    }

    // Check step6 mentions files but step1_read is empty/generic
    if (protocol.step1_read) {
      const readIsEmpty = /^(?:N\/?A|none|nothing|n\/a|\s*)$/i.test(protocol.step1_read.trim());
      if (readIsEmpty && (hasCodeBlock || hasWriteMarker)) {
        checks.push({
          name: "no_read_before_write",
          passed: false,
          detail: `⚠️ Worker wrote/edited files but STEP1_READ is empty — likely didn't read before writing`,
          severity: "warning",
        });
      }
    }
  }

  // ─── CHECK 8: Delete safety ───────────────────────────────
  // Flag any file deletions — they're high-risk and should be scrutinized
  if (execSummary) {
    const deleteOps = execSummary.operations.filter(
      op => op.operation.type === "delete_file"
    );
    for (const op of deleteOps) {
      checks.push({
        name: `delete_safety:${op.operation.path ?? "unknown"}`,
        passed: op.success, // still flag it even if successful
        detail: `⚠️ FILE DELETED: ${op.operation.path ?? "unknown"} — verify this was intentional`,
        severity: "warning",
      });
    }
  }

  // ─── SCORE ─────────────────────────────────────────────────
  const criticalChecks = checks.filter(c => c.severity === "critical");
  const warningChecks = checks.filter(c => c.severity === "warning");

  const criticalPassed = criticalChecks.filter(c => c.passed).length;
  const criticalTotal = criticalChecks.length;
  const warningPassed = warningChecks.filter(c => c.passed).length;
  const warningTotal = warningChecks.length;

  // Score: critical checks worth 80%, warnings 20%
  const criticalScore = criticalTotal > 0 ? criticalPassed / criticalTotal : 1.0;
  const warningScore = warningTotal > 0 ? warningPassed / warningTotal : 1.0;
  const score = criticalScore * 0.8 + warningScore * 0.2;

  const passed = criticalChecks.every(c => c.passed);

  const failedChecks = checks.filter(c => !c.passed);
  const summary = passed
    ? `✅ Validated: ${checks.length} checks, all critical passed (score: ${(score * 100).toFixed(0)}%)`
    : `❌ Validation failed: ${failedChecks.length}/${checks.length} checks failed — ${failedChecks.map(c => c.detail).join("; ").slice(0, 200)}`;

  return { passed, score, checks, summary };
}

// ─── HELPERS ─────────────────────────────────────────────────

interface MentionedFiles {
  created: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Extract file paths mentioned in worker protocol.
 * Looks for patterns like:
 * - "Created src/foo.ts"
 * - "// Write to: src/foo.ts"
 * - "Modified `src/bar.ts`"
 * - Code fence comments: "// Path: src/foo.ts"
 */
function extractMentionedFiles(protocol: WorkerProtocol): MentionedFiles {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  const allText = [
    protocol.step4_decide,
    protocol.step6_execute,
    protocol.step7_verify,
    protocol.step8_report,
  ].filter(Boolean).join("\n");

  // "// Write to: path" or "// Path: path"
  for (const match of allText.matchAll(/\/\/\s*(?:Write to|Path|File):\s*(.+)/gi)) {
    const path = match[1].trim();
    if (path && !path.startsWith("http")) created.push(path);
  }

  // "Create `path`" / "Created `path`"
  for (const match of allText.matchAll(/[Cc]reate[ds]?\s+`([^`]+\.\w+)`/g)) {
    if (!created.includes(match[1])) created.push(match[1]);
  }

  // "Edit `path`" / "Modified `path`" / "Updated `path`"
  for (const match of allText.matchAll(/(?:Edit|Modif|Updat)\w*\s+`([^`]+\.\w+)`/g)) {
    if (!modified.includes(match[1])) modified.push(match[1]);
  }

  // "Delete `path`" / "Removed `path`"
  for (const match of allText.matchAll(/(?:Delet|Remov)\w*\s+`([^`]+\.\w+)`/g)) {
    if (!deleted.includes(match[1])) deleted.push(match[1]);
  }

  return { created, modified, deleted };
}

function formatSize(path: string): string {
  try {
    return formatBytes(statSync(path).size);
  } catch {
    return "?";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
