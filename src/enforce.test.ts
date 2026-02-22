/**
 * FOREMAN — Pipeline Enforcement Tests
 *
 * Prompt'la "lütfen formatla" demek yetmez.
 * Pipeline'ın kendisi enforce etmeli:
 * - Yanlış format → retry
 * - Retry sonrası da yanlış → BLOCK
 * - Worker 8-adım eksik → BLOCK
 * - Düşük confidence → BLOCK sinyali
 */

import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Engine } from "./engine.js";
import { MockProvider } from "./provider.js";
import { Orchestrator, OrchestratorEvent } from "./orchestrator.js";

const PASS = "✅";
const FAIL = "❌";
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.error(`   ${err}`);
    failed++;
  }
}

async function run() {

  // ─── TEST 1: Worker lazy response → retry → gets formatted ──

  await test("Worker lazy response triggers retry and succeeds", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-enforce-1-"));
    const engine = new Engine({
      projectRoot: tempDir,
      projectName: "test",
      rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
      maxFormatRetries: 2,
    });
    const mock = new MockProvider();

    mock.enqueueResponses(
      // First: lazy response (no STEP fields)
      `I created the gradient div and it looks great. Build passes.`,

      // Retry: proper format
      `STEP1_READ: Read HeroSection.tsx
STEP2_CONTEXT: Empty component
STEP3_IMPACT: No side effects
STEP4_DECIDE: Add gradient div
STEP5_PREDICT: Gradient visible
STEP6_EXECUTE: Added div
STEP7_VERIFY: Build passes
STEP8_REPORT: Gradient added successfully
CONFIDENCE: 0.9`,
    );

    engine.providers.register({
      name: "mock",
      supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o"],
      generate: mock.generate.bind(mock),
    });

    const chain = engine.chains.create({ name: "test", goal: "test", layer: "worker" });
    const result = await engine.stepWithPhase(chain.id, "Add gradient", "worker", "execute");

    assert.equal(result.thought.status, "done", "Should succeed after retry");
    assert.equal(result.retryCount, 1, "Should have retried once");
    assert.ok(result.thought.workerProtocol, "Protocol should be populated");
    assert.ok(result.thought.workerProtocol!.step1_read.includes("HeroSection"));
  });

  // ─── TEST 2: Worker completely refuses format → BLOCK ──

  await test("Worker refuses format after max retries → BLOCK", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-enforce-2-"));
    const engine = new Engine({
      projectRoot: tempDir,
      projectName: "test",
      rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
      maxFormatRetries: 2,
    });
    const mock = new MockProvider();

    // Worker gets aggressive retry (up to 4), provide enough lazy responses
    mock.enqueueResponses(
      `I did the thing, it works great.`,
      `Sure, I created the component. All good.`,
      `The gradient is there and looks nice.`,
      `Yeah it's done, trust me.`,
      `Finished the work successfully.`,
    );

    engine.providers.register({
      name: "mock",
      supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o"],
      generate: mock.generate.bind(mock),
    });

    const chain = engine.chains.create({ name: "test", goal: "test", layer: "worker" });
    const result = await engine.stepWithPhase(chain.id, "Add gradient", "worker", "execute");

    assert.equal(result.thought.status, "blocked", "Should be BLOCKED");
    assert.ok(result.retryCount >= 2, `Should have retried at least twice, got ${result.retryCount}`);
    assert.ok(result.thought.blockedReason!.includes("Parse failed"));
  });

  // ─── TEST 3: Decompose returns no blocks → pipeline BLOCK ──

  await test("Decompose with no blocks → pipeline stops", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-enforce-3-"));
    const engine = new Engine({
      projectRoot: tempDir,
      projectName: "test",
      rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
      maxFormatRetries: 1,
    });
    const mock = new MockProvider();

    mock.enqueueResponses(
      // Vision — valid
      `REASONING: Nice project
OUTPUT: Build something cool
CONFIDENCE: 0.8
NEEDS_RESEARCH: false`,

      // Decompose — no parseable blocks (3 tries: initial + 1 retry)
      `REASONING: I thought about it
OUTPUT: There are many things to do but I can not list them clearly
CONFIDENCE: 0.5`,

      // Retry — still no blocks
      `REASONING: Let me try again
OUTPUT: We should do hero and services and about page
CONFIDENCE: 0.6`,
    );

    engine.providers.register({
      name: "mock",
      supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o"],
      generate: mock.generate.bind(mock),
    });

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(e => events.push(e));

    const result = await orchestrator.run("Build a website");

    assert.equal(result.success, false, "Pipeline should fail");
    assert.ok(result.blockedAt?.includes("decompose"), `Blocked at: ${result.blockedAt}`);
  });

  // ─── TEST 4: Vision low confidence → BLOCK ──

  await test("Vision with very low confidence → pipeline stops", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-enforce-4-"));
    const engine = new Engine({
      projectRoot: tempDir,
      projectName: "test",
      rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
    });
    const mock = new MockProvider();

    mock.enqueueResponses(
      `REASONING: I have no idea what this project is about
OUTPUT: Maybe dark maybe light I am not sure
CONFIDENCE: 0.2
NEEDS_RESEARCH: true`,
    );

    engine.providers.register({
      name: "mock",
      supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o"],
      generate: mock.generate.bind(mock),
    });

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(e => events.push(e));

    const result = await orchestrator.run("Build something");

    assert.equal(result.success, false);
    const blocks = events.filter(e => e.type === "block_detected");
    assert.ok(blocks.length > 0, "Should emit block_detected");
  });

  // ─── TEST 5: Worker partial protocol → BLOCK ──

  await test("Worker with partial 8-step protocol → BLOCK", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-enforce-5-"));
    const engine = new Engine({
      projectRoot: tempDir,
      projectName: "test",
      rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
      maxFormatRetries: 0, // no retries — fail fast
    });
    const mock = new MockProvider();

    // Only 3 of 8 steps
    mock.enqueueResponses(
      `STEP1_READ: Read file
STEP6_EXECUTE: Wrote code
STEP8_REPORT: Done
CONFIDENCE: 0.7`,
    );

    engine.providers.register({
      name: "mock",
      supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o"],
      generate: mock.generate.bind(mock),
    });

    const chain = engine.chains.create({ name: "test", goal: "test", layer: "worker" });
    const result = await engine.stepWithPhase(chain.id, "Do something", "worker", "execute");

    assert.equal(result.thought.status, "blocked");
    assert.ok(result.thought.blockedReason!.includes("Parse failed") ||
              result.thought.blockedReason!.includes("Missing") ||
              result.thought.blockedReason!.includes("Validation"));
  });

  // ─── SUMMARY ──────────────────────────────────────────────

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
