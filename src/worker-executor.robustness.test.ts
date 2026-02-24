/**
 * FOREMAN — Worker Executor Test
 * 
 * Verifies robust extraction and execution of worker operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractOperations, executeOperations } from "./worker-executor.js";
import type { WorkerProtocol } from "./types.js";
import type { ExecutionEngine } from "./execution-engine.js";
import type { EditEngine } from "./edit-engine.js";

describe("Worker Executor Robustness", () => {
  const mockProtocol: WorkerProtocol = {
    step1_read: "Read files",
    step2_context: "Context understanding",
    step3_impact: "Low impact",
    step4_decide: "Decided to change files",
    step5_predict: "Expect success",
    step6_execute: "Executing changes",
    step7_verify: "Verifying",
    step8_report: "Report"
  };

  describe("extractOperations", () => {
    it("should extract new_file operations from markdown fences", () => {
      const protocol = {
        ...mockProtocol,
        step4_decide: "Create a new file:\n```typescript\n// Path: src/test.ts\nconsole.log('test');\n```"
      };
      const ops = extractOperations(protocol);
      expect(ops).toContainEqual({
        type: "write_file",
        path: "src/test.ts",
        content: "console.log('test');"
      });
    });

    it("should extract multiple write operations", () => {
      const protocol = {
        ...mockProtocol,
        step6_execute: "Creating config:\n```json\n// File: config.json\n{}\n```\nAnd code:\n```js\n// Path: index.js\nmodule.exports = {};\n```"
      };
      const ops = extractOperations(protocol);
      expect(ops).toHaveLength(2);
      expect(ops[0].path).toBe("config.json");
      expect(ops[1].path).toBe("index.js");
    });

    it("should extract edit_file operations with arrows", () => {
      const protocol = {
        ...mockProtocol,
        step6_execute: "Edit \"src/app.ts\":\n```ts\nold\n```\n->\n```ts\nnew\n```"
      };
      const ops = extractOperations(protocol);
      expect(ops).toContainEqual({
        type: "edit_file",
        path: "src/app.ts",
        oldText: "old",
        newText: "new"
      });
    });

    it("should extract shell commands starting with $", () => {
      const protocol = {
        ...mockProtocol,
        step6_execute: "Running tests:\n$ npm test\n$ ls -la"
      };
      const ops = extractOperations(protocol);
      expect(ops).toContainEqual({ type: "run_command", command: "npm test" });
      expect(ops).toContainEqual({ type: "run_command", command: "ls -la" });
    });

    it("should skip dangerous commands", () => {
      const protocol = {
        ...mockProtocol,
        step6_execute: "Cleanup:\n$ rm -rf /\n$ sudo rm -rf ."
      };
      const ops = extractOperations(protocol);
      expect(ops.some(o => o.type === "run_command" && o.command?.includes("rm -rf /"))).toBe(false);
    });

    it("should extract rename operations", () => {
      const protocol = {
        ...mockProtocol,
        step6_execute: "Rename `old.ts` to `new.ts`"
      };
      const ops = extractOperations(protocol);
      expect(ops).toContainEqual({
        type: "rename_node",
        path: "old.ts",
        newPath: "new.ts"
      });
    });
  });

  describe("executeOperations", () => {
    let mockExec: any;
    let mockEdit: any;
    const projectRoot = "/tmp/foreman-test";

    beforeEach(() => {
      mockExec = {
        writeFile: vi.fn().mockReturnValue({ success: true }),
        runShell: vi.fn().mockReturnValue({ exitCode: 0, stdout: "ok" }),
        deleteFile: vi.fn().mockReturnValue({ success: true }),
        gitStatus: vi.fn().mockReturnValue({ clean: true })
      };
      mockEdit = {
        edit: vi.fn().mockReturnValue({ success: true })
      };
    });

    it("should execute write operations through engine", async () => {
      const ops: any[] = [{ type: "write_file", path: "test.txt", content: "hello" }];
      const result = await executeOperations(ops, mockExec, mockEdit, projectRoot);
      
      expect(mockExec.writeFile).toHaveBeenCalledWith(expect.stringContaining("test.txt"), "hello");
      expect(result.succeeded).toBe(1);
    });

    it("should execute shell commands and capture output", async () => {
      const ops: any[] = [{ type: "run_command", command: "ls" }];
      const result = await executeOperations(ops, mockExec, mockEdit, projectRoot);
      
      expect(mockExec.runShell).toHaveBeenCalledWith("ls", 60000);
      expect(result.succeeded).toBe(1);
      expect(result.operations[0].output).toBe("ok");
    });

    it("should cap execution to prevent runaway", async () => {
      const manyOps = Array(30).fill({ type: "run_command", command: "echo" });
      const result = await executeOperations(manyOps, mockExec, mockEdit, projectRoot, { maxOps: 5 });
      
      expect(result.totalOps).toBe(5);
    });

    it("should handle mixed success/failure", async () => {
      mockExec.runShell.mockReturnValueOnce({ exitCode: 1, stderr: "fail" });
      const ops: any[] = [
        { type: "run_command", command: "bad" },
        { type: "write_file", path: "good.txt", content: "ok" }
      ];
      const result = await executeOperations(ops, mockExec, mockEdit, projectRoot);
      
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.operations[0].error).toBe("fail");
    });
  });
});
