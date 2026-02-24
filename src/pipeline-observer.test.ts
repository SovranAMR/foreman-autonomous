import { PipelineObserver } from "./pipeline-observer.js";
import { Orchestrator } from "./orchestrator.js";
import { Engine } from "./engine.js";
import { MockProvider } from "./provider.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import assert from "node:assert";

async function testPipelineObserver() {
  const projectRoot = mkdtempSync(join(tmpdir(), "foreman-test-"));
  console.log(`Testing in ${projectRoot}`);

  try {
    const provider = new MockProvider();
    const engine = new Engine({ projectRoot, provider });
    const orchestrator = new Orchestrator(engine);
    const observer = orchestrator.observer;

    console.log("Checking initial state...");
    assert.strictEqual(observer.getBlocks().length, 0, "Should have 0 blocks initially");

    // Simulate pipeline events
    console.log("Simulating pipeline events...");
    observer.onPipelineStart("Test Task");
    observer.onPhaseStart("vision", "Creating vision");
    observer.onPhaseEnd("vision", "Vision created");

    observer.onBlockStart("Block 1/1: First Block");
    observer.onAtomStart("Atom 1/1: First Atom");
    observer.onToolCall("exec({command: 'ls'})");
    observer.onToolResult("file1.txt");
    observer.onOperation("write", true, "src/index.ts", "Success");
    observer.onAtomEnd(true, 100);
    observer.onBlockEnd();

    observer.onPipelineEnd(true);

    const summary = observer.getSummary();
    console.log("Verifying summary...");
    assert.strictEqual(summary.task, "Test Task");
    assert.strictEqual(summary.totalBlocks, 1);
    assert.strictEqual(summary.totalAtoms, 1);
    assert.strictEqual(summary.passedAtoms, 1);
    assert.strictEqual(summary.totalToolCalls, 1);
    assert.strictEqual(summary.totalTokens, 100);

    const blocks = observer.getBlocks();
    assert.strictEqual(blocks[0].atoms.length, 1);
    assert.strictEqual(blocks[0].atoms[0].operations.length, 1);
    assert.strictEqual(blocks[0].atoms[0].toolCalls.length, 1);

    console.log("✅ PipelineObserver test passed!");

  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

testPipelineObserver().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
