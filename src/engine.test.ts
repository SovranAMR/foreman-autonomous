/**
 * FOREMAN — Engine Smoke Test
 *
 * MockProvider ile tüm sistemi end-to-end test et.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Engine } from "./engine.js";
import { MockProvider } from "./provider.js";
import { ChainManager } from "./chain-manager.js";

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
  const tempDir = mkdtempSync(join(tmpdir(), "foreman-engine-test-"));

  // Setup: engine + mock provider
  const engine = new Engine({
    projectRoot: tempDir,
    projectName: "test-project",
    rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
  });

  const mockProvider = new MockProvider();
  mockProvider.enqueueResponses(
    // Response for first think() call
    `REASONING: The hero needs a strong visual focal point. Based on the dental theme, a smile arc would connect emotionally.
OUTPUT: Use a single gold smile arc as the hero focal element. No particles, no blur spam. One clean animation.
CONFIDENCE: 0.85
NEEDS_RESEARCH: false`,

    // Response for second think() call (strategist — decompose format)
    `REASONING: Breaking down the hero into blocks based on the vision.
OUTPUT:
Block 1: Background gradient
Block 2: Smile arc SVG
Block 3: Typography
Block 4: CTA button
Block 5: Scroll indicator
CONFIDENCE: 0.9
NEEDS_RESEARCH: false`,

    // Response for worker
    `STEP1_READ: Read HeroSection.tsx, found existing div structure
STEP2_CONTEXT: Component uses GSAP, has timeline at line 50
STEP3_IMPACT: Adding SVG path won't affect existing animations
STEP4_DECIDE: Insert SVG element after the background div, z-index 2
STEP5_PREDICT: Gold arc will render centered, 200px wide
STEP6_EXECUTE: Added SVG with quadratic bezier path
STEP7_VERIFY: Build passes, arc visible in browser
STEP8_REPORT: Done. SVG path added at line 85, 12 lines of code.
CONFIDENCE: 0.9`,
  );

  // Register mock provider for all model names
  engine.providers.register({
    name: "mock",
    supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o", "gpt-4o-mini", "gemini-flash", "gemini-pro"],
    generate: mockProvider.generate.bind(mockProvider),
  });

  // Create a chain
  const chainManager = new ChainManager(tempDir);
  const chain = chainManager.create({
    id: "chain_test_hero",
    name: "Hero Section",
    goal: "Build a show-level hero section for dental clinic",
    layer: "visioner",
  });

  // ─── TESTS ──────────────────────────────────────────────────

  await test("Engine creates with fresh state", async () => {
    assert.equal(engine.state.current(), "idle");
  });

  await test("Engine.step() visioner — produces thought with reasoning", async () => {
    const thought = await engine.step(
      chain.id,
      "What should the hero section feel like? Define the vision.",
      "visioner",
    );

    assert.ok(thought.id.startsWith("t_"));
    assert.equal(thought.status, "done");
    assert.ok(thought.reasoning.length > 0);
    assert.ok(thought.output.length > 0);
    assert.ok(thought.confidence > 0);
    assert.ok(thought.tokenCost! > 0);
    assert.ok(thought.completedAt);
  });

  await test("Engine.step() strategist — decomposes into blocks", async () => {
    const thought = await engine.step(
      chain.id,
      "Break the hero into implementable blocks",
      "strategist",
      ["t_001"],
    );

    assert.equal(thought.layer, "strategist");
    assert.ok(thought.output.includes("Background gradient") || thought.output.includes("1."));
  });

  await test("Engine.step() worker — follows worker protocol", async () => {
    const thought = await engine.step(
      chain.id,
      "Add smile arc SVG to HeroSection.tsx",
      "worker",
      ["t_001", "t_002"],
    );

    assert.equal(thought.layer, "worker");
    assert.equal(thought.status, "done");
    // Worker protocol parse edilip Thought'a yazılmış olmalı
    assert.ok(thought.workerProtocol, "Worker protocol should be populated");
    assert.ok(thought.workerProtocol!.step1_read.length > 0, "step1_read should not be empty");
    assert.ok(thought.workerProtocol!.step8_report.length > 0, "step8_report should not be empty");
  });

  await test("Thoughts persisted to disk", async () => {
    const files = readdirSync(join(tempDir, "thoughts"))
      .filter(f => f.endsWith(".json"));
    assert.ok(files.length >= 3, `Expected >= 3 thought files, got ${files.length}`);
  });

  await test("Chain has all thoughts", async () => {
    const updatedChain = chainManager.get(chain.id);
    assert.ok(updatedChain!.thoughts.length >= 3);
  });

  await test("State tracks token usage", async () => {
    const snap = engine.state.snapshot();
    assert.ok(snap.totalTokens > 0, `Expected tokens > 0, got ${snap.totalTokens}`);
  });

  await test("State has transition history", async () => {
    const history = engine.state.recentHistory(20);
    assert.ok(history.length > 0);
  });

  await test("MockProvider recorded all calls", async () => {
    assert.equal(mockProvider.callHistory.length, 3);
    // First call should have visioner system prompt
    assert.ok(mockProvider.callHistory[0].messages[0].content.includes("VISIONER"));
    // Second should have strategist
    assert.ok(mockProvider.callHistory[1].messages[0].content.includes("STRATEGIST"));
    // Third should have worker
    assert.ok(mockProvider.callHistory[2].messages[0].content.includes("WORKER"));
  });

  await test("Rate limiter tracked tokens", async () => {
    const usage = engine.rateLimiter.tokenUsage();
    assert.ok(usage.session > 0);
  });

  // ─── SUMMARY ──────────────────────────────────────────────

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
