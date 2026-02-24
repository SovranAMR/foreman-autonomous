import { Orchestrator } from "./orchestrator.js";
import { Engine } from "./engine.js";
import assert from "node:assert";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

/**
 * Robustness Test: Orchestrator Resilience
 * Focuses on retry logic, timeout handling, and context window evaluation.
 */
async function runTests() {
  const projectRoot = "/tmp/foreman-robustness-test";
  console.log(`Running Orchestrator robustness tests in ${projectRoot}...`);

  // Setup
  if (existsSync(projectRoot)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(`${projectRoot}/chains`, { recursive: true });
  mkdirSync(`${projectRoot}/thoughts`, { recursive: true });

  // Dummy package.json to avoid project detection errors
  writeFileSync(`${projectRoot}/package.json`, JSON.stringify({ name: "test-project" }));

  const engine = new Engine({
    projectRoot,
    projectName: "test-project",
    model: "mock-model"
  });

  const orchestrator = new Orchestrator(engine);

  // 1. Test: Context Window Evaluation
  {
    console.log("Testing context window evaluation...");
    const model = "gemini-3.1-pro"; // 1M context
    const window = engine.getContextWindow(model);
    assert.strictEqual(window.tokens, 1_048_576, "Should resolve correct context window for Gemini 3.1 Pro");
    
    const smallEval = engine.evaluateContext(model, "system", "user", "context");
    assert.ok(smallEval.isSafe, "Small context should be safe");
    
    // Large context test (simulated)
    const largeContext = "a".repeat(10 * 1024 * 1024); // ~10MB string
    const largeEval = engine.evaluateContext(model, "system", "user", largeContext);
    // Since estimateTokens uses length/4, 10MB -> 2.5M tokens
    assert.ok(!largeEval.isSafe, "Large context should trigger unsafe flag");
    console.log("✅ Context window evaluation passed");
  }

  // 2. Test: Retry Logic (Internal Engine format correction)
  {
    console.log("Testing format retry logic...");
    // Mock the provider to fail once then succeed
    let calls = 0;
    const mockProvider = {
      name: "mock-provider",
      generate: async () => {
        calls++;
        if (calls === 1) {
          return { text: "Invalid output", tokenUsage: { input: 10, output: 10, total: 20 }, model: "mock" };
        }
        return { 
          text: "REASONING: Fixed\nOUTPUT: Success\nCONFIDENCE: 0.9", 
          tokenUsage: { input: 10, output: 10, total: 20 }, 
          model: "mock" 
        };
      }
    };
    
    // Override callLLM to use our failing mock
    const originalCallLLM = engine.callLLM.bind(engine);
    engine.callLLM = async (sys, user, layer) => {
        return mockProvider.generate();
    };

    const chain = engine.chains.create({ name: "test", goal: "test", layer: "visioner" });
    const result = await engine.stepWithPhase(chain.id, "input", "visioner", "vision");
    
    assert.strictEqual(calls, 2, "Should have called LLM twice (1 failure + 1 retry)");
    assert.ok(result.formatValid, "Should be valid after retry");
    assert.strictEqual(result.retryCount, 1, "Retry count should be 1");
    
    // Restore
    engine.callLLM = originalCallLLM;
    console.log("✅ Format retry logic passed");
  }

  // 3. Test: Worker Executor - Operation Extraction
  {
    console.log("Testing operation extraction...");
    const protocol = {
        step1_read: "...", step2_context: "...", step3_impact: "...",
        step4_decide: "I will write to src/test.ts",
        step5_predict: "...",
        step6_execute: "Write to `src/test.ts`:\n```typescript\nconst x = 1;\n```\n$ npm test",
        step7_verify: "...", step8_report: "..."
    };
    
    const { extractOperations } = await import("./worker-executor.js");
    const ops = extractOperations(protocol as any);
    
    assert.strictEqual(ops.length, 2, "Should extract 2 operations");
    assert.strictEqual(ops[0].type, "write_file", "First op should be write_file");
    assert.strictEqual(ops[0].path, "src/test.ts", "Path should be src/test.ts");
    assert.strictEqual(ops[1].type, "run_command", "Second op should be run_command");
    assert.strictEqual(ops[1].command, "npm test", "Command should be npm test");
    console.log("✅ Operation extraction passed");
  }

  // 4. Test: Cost Tracker Phase Breakdown
  {
    console.log("Testing cost tracker phase breakdown...");
    engine.costTracker.record("gpt-4o", "vision", 1000, 500);
    engine.costTracker.record("gpt-4o", "worker", 2000, 1000);
    
    const report = engine.costTracker.generateReport();
    const visionPhase = report.byPhase.find(p => p.phase === "vision");
    const workerPhase = report.byPhase.find(p => p.phase === "worker");
    
    assert.ok(visionPhase, "Vision phase should exist in report");
    assert.ok(workerPhase, "Worker phase should exist in report");
    assert.ok(workerPhase.totalCost > visionPhase.totalCost, "Worker phase should be more expensive");
    console.log("✅ Cost tracker phase breakdown passed");
  }

  console.log("\n────────────────────────────────────────");
  console.log("Results: All robustness tests passed");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
