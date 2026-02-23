/**
 * Pipeline Observer Tests
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PipelineObserver, createPipelineObserver } from "./pipeline-observer.js";
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("PipelineObserver", () => {
  let tmpDir: string;
  let observer: PipelineObserver;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "observer-test-"));
    observer = new PipelineObserver(tmpDir);
  });

  it("should create log directory", () => {
    assert.ok(existsSync(join(tmpDir, ".foreman", "observer")));
  });

  it("should track pipeline lifecycle", () => {
    observer.onPipelineStart("Test task");
    observer.onPhaseStart("vision", "Analyzing task");
    observer.onPhaseEnd("vision", "Vision complete");
    observer.onBlockStart("Block 1/2: First block");
    observer.onAtomStart("Atom 1/3: Create file");
    observer.onAtomEnd(true, 500);
    observer.onBlockEnd();
    observer.onPipelineEnd(true);

    const summary = observer.getSummary();
    assert.equal(summary.task, "Test task");
    assert.equal(summary.totalBlocks, 1);
    assert.equal(summary.passedAtoms, 1);
    assert.equal(summary.failedAtoms, 0);
  });

  it("should track worker input/output", () => {
    observer.onPipelineStart("Worker test");
    observer.onBlockStart("Block 1/1: Test");
    observer.onAtomStart("Atom 1/1: Write code");
    observer.onWorkerInput("Write a function that adds two numbers");
    observer.onWorkerOutput("STEP1_READ: Found math.ts...", 0.9);
    observer.onAtomEnd(true);

    const blocks = observer.getBlocks();
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].atoms.length, 1);
    assert.ok(blocks[0].atoms[0].workerInput?.includes("adds two numbers"));
    assert.equal(blocks[0].atoms[0].confidence, 0.9);
  });

  it("should track tool calls", () => {
    observer.onPipelineStart("Tool test");
    observer.onBlockStart("Block 1/1: Test");
    observer.onAtomStart("Atom 1/1: Run command");
    observer.onToolCall("bash(npm test)");
    observer.onToolResult("bash → ✔ All tests passed");
    observer.onToolCall("read_file(src/app.ts)");
    observer.onToolResult("read_file → ✔ 120 lines");
    observer.onAtomEnd(true);

    const atom = observer.getAtomDetail(0, 0);
    assert.ok(atom);
    assert.equal(atom.toolCalls.length, 2);
    assert.equal(atom.toolCalls[0].name, "bash");
  });

  it("should track retry/rejection", () => {
    observer.onPipelineStart("Retry test");
    observer.onBlockStart("Block 1/1: Test");
    observer.onAtomStart("Atom 1/1: Fix bug");
    observer.onWorkerRetry(0, "Missing error handling");
    observer.onWorkerRetry(1, "Still no try/catch");
    observer.onAtomEnd(true);

    const atom = observer.getAtomDetail(0, 0);
    assert.ok(atom);
    assert.equal(atom.attempts, 2);
    assert.ok(atom.rejectionFeedback?.includes("try/catch"));
  });

  it("should track failed atoms", () => {
    observer.onPipelineStart("Fail test");
    observer.onBlockStart("Block 1/1: Test");
    observer.onAtomStart("Atom 1/2: Pass");
    observer.onAtomEnd(true);
    observer.onAtomStart("Atom 2/2: Fail");
    observer.onAtomEnd(false);
    observer.onBlockEnd();

    const summary = observer.getSummary();
    assert.equal(summary.passedAtoms, 1);
    assert.equal(summary.failedAtoms, 1);
  });

  it("should track errors", () => {
    observer.onPipelineStart("Error test");
    observer.onOrchestratorEvent({ type: "error", message: "Budget exceeded" });
    
    const summary = observer.getSummary();
    assert.equal(summary.errors.length, 1);
    assert.ok(summary.errors[0].includes("Budget exceeded"));
  });

  it("should generate JSONL log", () => {
    observer.onPipelineStart("Log test");
    observer.onPhaseStart("vision", "Starting");
    observer.onPipelineEnd(true);

    const logPath = observer.getLogPath();
    assert.ok(existsSync(logPath));
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    assert.ok(lines.length >= 3); // start + phase + end
    
    // Each line should be valid JSON
    for (const line of lines) {
      JSON.parse(line); // throws if invalid
    }
  });

  it("should generate markdown summary", () => {
    observer.onPipelineStart("Summary test");
    observer.onBlockStart("Block 1/1: Build feature");
    observer.onAtomStart("Atom 1/1: Write code");
    observer.onAtomEnd(true, 1000);
    observer.onBlockEnd();
    observer.onPipelineEnd(true);

    const md = observer.formatMarkdownSummary();
    assert.ok(md.includes("# Forge Pipeline Report"));
    assert.ok(md.includes("Summary test"));
    assert.ok(md.includes("Build feature"));
  });

  it("should generate Telegram summary", () => {
    observer.onPipelineStart("Telegram test");
    observer.onBlockStart("Block 1/1: Create API");
    observer.onAtomStart("Atom 1/1: Endpoint");
    observer.onAtomEnd(true);
    observer.onBlockEnd();
    observer.onPipelineEnd(true);

    const tg = observer.formatTelegramSummary();
    assert.ok(tg.includes("Forge Pipeline Raporu"));
    assert.ok(tg.includes("1✔"));
  });

  it("should get full timeline", () => {
    observer.onPipelineStart("Timeline test");
    observer.onPhaseStart("vision", "Go");
    observer.onPhaseEnd("vision", "Done");

    const timeline = observer.getTimeline();
    assert.ok(timeline.length >= 3);
    // Events should be in chronological order
    for (let i = 1; i < timeline.length; i++) {
      assert.ok(timeline[i].timestamp >= timeline[i - 1].timestamp);
    }
  });

  it("should create observer via factory", () => {
    const obs = createPipelineObserver(tmpDir);
    assert.ok(obs instanceof PipelineObserver);
  });

  // Cleanup
  it("cleanup temp dirs", () => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });
});
