import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractOperations,
  extractCommands,
  needsExecution,
  buildExecutionFeedback,
  type ExtractedOperation,
  type WorkerExecutionSummary,
} from "./worker-executor.js";
import type { WorkerProtocol } from "./types.js";

const makeProtocol = (overrides: Partial<WorkerProtocol> = {}): WorkerProtocol => ({
  step1_read: "Read the file",
  step2_context: "Understood context",
  step3_impact: "No side effects",
  step4_decide: overrides.step4_decide ?? "Will write to file",
  step5_predict: "Should work",
  step6_execute: overrides.step6_execute ?? "Done",
  step7_verify: "Build passes",
  step8_report: "All good",
});

describe("Worker Executor — Operation Extraction", () => {
  it("extracts shell commands from bash code blocks", () => {
    const protocol = makeProtocol({
      step6_execute: `Applied changes:\n\`\`\`bash\nnpm install express\nnpm test\n\`\`\``,
    });
    const ops = extractOperations(protocol);
    const cmds = ops.filter(o => o.type === "run_command");
    assert.ok(cmds.length >= 2);
    assert.ok(cmds.some(c => c.command?.includes("npm install")));
    assert.ok(cmds.some(c => c.command?.includes("npm test")));
  });

  it("extracts inline $ commands", () => {
    const protocol = makeProtocol({
      step6_execute: `Changes applied:\n$ npm run build\n$ git add .\nDone.`,
    });
    const ops = extractOperations(protocol);
    const cmds = ops.filter(o => o.type === "run_command");
    assert.ok(cmds.length >= 2);
  });

  it("extracts commands from text", () => {
    const text = "Then run npm install express and also git commit -m 'fix'";
    const cmds = extractCommands(text);
    assert.ok(cmds.some(c => c.includes("npm install")));
    assert.ok(cmds.some(c => c.includes("git commit")));
  });

  it("extracts npm/git/build commands", () => {
    const text = "Run pnpm test then cargo build --release";
    const cmds = extractCommands(text);
    assert.ok(cmds.some(c => c.includes("pnpm test")));
    assert.ok(cmds.some(c => c.includes("cargo build")));
  });

  it("extracts rename operations", () => {
    const protocol = makeProtocol({
      step6_execute: "Rename `old.ts` to `new.ts`",
    });
    const ops = extractOperations(protocol);
    assert.equal(ops[0].type, "rename_node");
    assert.equal(ops[0].path, "old.ts");
    assert.equal(ops[0].newPath, "new.ts");
  });
});

describe("Worker Executor — Needs Execution", () => {
  it("returns true for protocol with code blocks", () => {
    const protocol = makeProtocol({
      step6_execute: "Applied:\n```typescript\nconsole.log('hi')\n```",
    });
    assert.equal(needsExecution(protocol), true);
  });

  it("returns true for protocol with commands", () => {
    const protocol = makeProtocol({
      step6_execute: "Ran:\n$ npm test",
    });
    assert.equal(needsExecution(protocol), true);
  });

  it("returns true for protocol with file paths", () => {
    const protocol = makeProtocol({
      step6_execute: "Updated src/index.ts with the new handler",
    });
    assert.equal(needsExecution(protocol), true);
  });

  it("returns false for analysis-only", () => {
    const protocol = makeProtocol({
      step4_decide: "No changes needed, the code is already correct",
      step6_execute: "Analysis complete, no modifications required",
    });
    assert.equal(needsExecution(protocol), false);
  });
});

describe("Worker Executor — Execution Feedback", () => {
  it("builds feedback for successful ops", () => {
    const summary: WorkerExecutionSummary = {
      operations: [
        { operation: { type: "write_file", path: "test.ts" }, success: true, output: "Wrote test.ts" },
        { operation: { type: "run_command", command: "npm test" }, success: true, output: "All pass" },
      ],
      totalOps: 2,
      succeeded: 2,
      failed: 0,
      output: "  ✔ write_file test.ts\n  ✔ run_command npm test",
    };
    const feedback = buildExecutionFeedback(summary);
    assert.ok(feedback.includes("2/2 succeeded"));
    assert.ok(!feedback.includes("failed"));
  });

  it("builds feedback with failures", () => {
    const summary: WorkerExecutionSummary = {
      operations: [
        { operation: { type: "run_command", command: "npm test" }, success: false, error: "Exit 1" },
      ],
      totalOps: 1,
      succeeded: 0,
      failed: 1,
      output: "  ✖ run_command npm test → Exit 1",
    };
    const feedback = buildExecutionFeedback(summary);
    assert.ok(feedback.includes("0/1 succeeded"));
    assert.ok(feedback.includes("1 operation(s) failed"));
  });

  it("returns empty for zero ops", () => {
    const summary: WorkerExecutionSummary = {
      operations: [],
      totalOps: 0,
      succeeded: 0,
      failed: 0,
      output: "",
    };
    assert.equal(buildExecutionFeedback(summary), "");
  });
});
