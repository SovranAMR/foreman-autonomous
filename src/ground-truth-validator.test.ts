/**
 * FOREMAN — Ground Truth Validator Tests
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { validateWorkerOutput, type ValidationResult } from "./ground-truth-validator.js";
import type { WorkerProtocol } from "./types.js";
import type { ExecutionEngine } from "./execution-engine.js";
import type { WorkerExecutionSummary } from "./worker-executor.js";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Ground Truth Validator", () => {
  let tempDir: string;
  let mockExec: ExecutionEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "foreman-gtv-"));
    mockExec = {
      runShell: (cmd: string, _timeout?: number) => {
        if (cmd.includes("git diff")) {
          return { success: true, exitCode: 0, stdout: "", stderr: "" };
        }
        if (cmd.includes("npm run build")) {
          return { success: true, exitCode: 0, stdout: "Build successful", stderr: "" };
        }
        if (cmd.includes("npm test")) {
          return { success: true, exitCode: 0, stdout: "ℹ tests 10\nℹ pass 10\nℹ fail 0", stderr: "" };
        }
        return { success: true, exitCode: 0, stdout: "", stderr: "" };
      },
    } as unknown as ExecutionEngine;
  });

  it("passes when created files actually exist", () => {
    // Create the file that worker claims to have created
    writeFileSync(join(tempDir, "test.ts"), "console.log('hello');");

    const protocol: WorkerProtocol = {
      step1_read: "Read files",
      step2_context: "Context",
      step3_impact: "Low",
      step4_decide: "Create `test.ts`",
      step5_predict: "Success",
      step6_execute: "// Write to: test.ts\nconsole.log('hello');",
      step7_verify: "✅ File created successfully\n```\n$ ls test.ts\ntest.ts\n```",
      step8_report: "Done",
    };

    const result = validateWorkerOutput(protocol, null, mockExec, tempDir);
    assert.ok(result.passed, `Expected pass but got: ${result.summary}`);
    assert.ok(result.score >= 0.8);
  });

  it("fails when created files do NOT exist", () => {
    // Don't create the file — worker is lying
    const protocol: WorkerProtocol = {
      step1_read: "Read files",
      step2_context: "Context",
      step3_impact: "Low",
      step4_decide: "Create `nonexistent.ts`",
      step5_predict: "Success",
      step6_execute: "// Write to: nonexistent.ts\nconsole.log('hello');",
      step7_verify: "✅ File created",
      step8_report: "Done",
    };

    const result = validateWorkerOutput(protocol, null, mockExec, tempDir);
    assert.ok(!result.passed, "Should fail when file doesn't exist");
    const fileCheck = result.checks.find(c => c.name.includes("file_exists"));
    assert.ok(fileCheck, "Should have a file_exists check");
    assert.ok(!fileCheck.passed, "file_exists check should fail");
  });

  it("detects worker claiming success without evidence", () => {
    const protocol: WorkerProtocol = {
      step1_read: "Read files",
      step2_context: "Context",
      step3_impact: "Low",
      step4_decide: "Refactor code",
      step5_predict: "Success",
      step6_execute: "Done",
      step7_verify: "✅ Everything works perfectly! All good!",
      step8_report: "Success",
    };

    const result = validateWorkerOutput(protocol, null, mockExec, tempDir);
    const evidenceCheck = result.checks.find(c => c.name === "verify_evidence");
    assert.ok(evidenceCheck, "Should check for evidence");
    assert.ok(!evidenceCheck.passed, "Should flag lack of evidence");
  });

  it("passes when worker provides evidence", () => {
    const protocol: WorkerProtocol = {
      step1_read: "Read files",
      step2_context: "Context",
      step3_impact: "Low",
      step4_decide: "Fix bug",
      step5_predict: "Success",
      step6_execute: "Done",
      step7_verify: "Verified:\n```\n$ npm test\n10 passing\n```",
      step8_report: "Success",
    };

    const result = validateWorkerOutput(protocol, null, mockExec, tempDir);
    const evidenceCheck = result.checks.find(c => c.name === "verify_evidence");
    assert.ok(evidenceCheck, "Should check for evidence");
    assert.ok(evidenceCheck.passed, "Should pass with evidence");
  });

  it("catches failed execution operations", () => {
    const execSummary: WorkerExecutionSummary = {
      operations: [
        {
          operation: { type: "write_file", path: "broken.ts", content: "x" },
          success: false,
          error: "Permission denied",
        },
      ],
      totalOps: 1,
      succeeded: 0,
      failed: 1,
      output: "Failed",
    };

    const protocol: WorkerProtocol = {
      step1_read: "", step2_context: "", step3_impact: "",
      step4_decide: "", step5_predict: "", step6_execute: "",
      step7_verify: "", step8_report: "",
    };

    const result = validateWorkerOutput(protocol, execSummary, mockExec, tempDir);
    assert.ok(!result.passed, "Should fail with failed operations");
    const failCheck = result.checks.find(c => c.name.includes("exec_failed"));
    assert.ok(failCheck, "Should have exec_failed check");
  });

  it("detects build failures after changes", () => {
    const failExec = {
      runShell: (cmd: string) => {
        if (cmd.includes("npm run build")) {
          return { success: false, exitCode: 1, stdout: "error TS2304: Cannot find name 'foo'", stderr: "" };
        }
        if (cmd.includes("npm test")) {
          return { success: true, exitCode: 0, stdout: "10 pass\n0 fail", stderr: "" };
        }
        return { success: true, exitCode: 0, stdout: "", stderr: "" };
      },
    } as unknown as ExecutionEngine;

    const protocol: WorkerProtocol = {
      step1_read: "", step2_context: "", step3_impact: "",
      step4_decide: "", step5_predict: "", step6_execute: "",
      step7_verify: "✅ All good", step8_report: "",
    };

    const result = validateWorkerOutput(protocol, null, failExec, tempDir);
    const buildCheck = result.checks.find(c => c.name === "build_check");
    assert.ok(buildCheck, "Should have build check");
    assert.ok(!buildCheck.passed, "Build check should fail");
  });

  it("detects test failures after changes", () => {
    const failExec = {
      runShell: (cmd: string) => {
        if (cmd.includes("npm run build")) {
          return { success: true, exitCode: 0, stdout: "OK", stderr: "" };
        }
        if (cmd.includes("npm test")) {
          return { success: false, exitCode: 1, stdout: "3 fail\n7 pass", stderr: "" };
        }
        return { success: true, exitCode: 0, stdout: "", stderr: "" };
      },
    } as unknown as ExecutionEngine;

    const protocol: WorkerProtocol = {
      step1_read: "", step2_context: "", step3_impact: "",
      step4_decide: "", step5_predict: "", step6_execute: "",
      step7_verify: "✅ Tests pass", step8_report: "",
    };

    const result = validateWorkerOutput(protocol, null, failExec, tempDir);
    const testCheck = result.checks.find(c => c.name === "test_check");
    assert.ok(testCheck, "Should have test check");
    assert.ok(!testCheck.passed, "Test check should fail");
  });

  it("validates file content is not empty after write", () => {
    writeFileSync(join(tempDir, "real.ts"), "export const x = 1;");
    writeFileSync(join(tempDir, "empty.ts"), "");

    const execSummary: WorkerExecutionSummary = {
      operations: [
        { operation: { type: "write_file", path: "real.ts", content: "export const x = 1;" }, success: true },
        { operation: { type: "write_file", path: "empty.ts", content: "" }, success: true },
      ],
      totalOps: 2,
      succeeded: 2,
      failed: 0,
      output: "",
    };

    const protocol: WorkerProtocol = {
      step1_read: "", step2_context: "", step3_impact: "",
      step4_decide: "", step5_predict: "", step6_execute: "",
      step7_verify: "", step8_report: "",
    };

    const result = validateWorkerOutput(protocol, execSummary, mockExec, tempDir);
    const realCheck = result.checks.find(c => c.name === "file_content:real.ts");
    const emptyCheck = result.checks.find(c => c.name === "file_content:empty.ts");
    assert.ok(realCheck?.passed, "Non-empty file should pass");
    assert.ok(!emptyCheck?.passed, "Empty file should fail");
  });

  it("detects worker self-reporting failure", () => {
    const protocol: WorkerProtocol = {
      step1_read: "", step2_context: "", step3_impact: "",
      step4_decide: "", step5_predict: "", step6_execute: "",
      step7_verify: "❌ Build failed with 3 errors. Could not resolve imports.",
      step8_report: "Failed",
    };

    const result = validateWorkerOutput(protocol, null, mockExec, tempDir);
    const selfReport = result.checks.find(c => c.name === "worker_self_report_fail");
    assert.ok(selfReport, "Should detect self-reported failure");
    assert.ok(!selfReport.passed, "Self-reported failure should not pass");
  });

  it("score calculation: all critical pass = high score", () => {
    writeFileSync(join(tempDir, "good.ts"), "export const x = 1;");

    const protocol: WorkerProtocol = {
      step1_read: "", step2_context: "", step3_impact: "",
      step4_decide: "Create `good.ts`",
      step5_predict: "", step6_execute: "// Write to: good.ts",
      step7_verify: "```\n$ cat good.ts\nexport const x = 1;\n```",
      step8_report: "",
    };

    const result = validateWorkerOutput(protocol, null, mockExec, tempDir);
    assert.ok(result.score >= 0.8, `Score should be >= 0.8, got ${result.score}`);
  });
});
