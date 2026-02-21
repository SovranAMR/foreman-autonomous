/**
 * FOREMAN — Orchestrator Smoke Test
 *
 * Mock provider ile full pipeline test.
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
  const tempDir = mkdtempSync(join(tmpdir(), "foreman-orch-test-"));

  // Setup
  const engine = new Engine({
    projectRoot: tempDir,
    projectName: "test",
    rateLimitOverride: { minDelayBetweenCalls: 0, backoffBaseMs: 1 },
  });
  const mock = new MockProvider();

  // Program mock responses for minimal pipeline (1 block, 2 atoms)
  mock.enqueueResponses(
    // 1. Vision
    `REASONING: Premium dental feel needed.
OUTPUT: Dark theme with gold accents. Mobile-first.
CONFIDENCE: 0.9
NEEDS_RESEARCH: false`,

    // 2. Decompose — just 1 block
    `REASONING: Single block for minimal test.
OUTPUT:
Block 1: Hero section with animated focal element
CONFIDENCE: 0.85`,

    // 3a. Research block 1
    `FINDINGS: Minimalist heroes work best.
RELEVANCE: 0.9
RISKS: None`,

    // 3b. Atomize block 1 — just 2 atoms
    `OUTPUT:
1. Create background gradient div
2. Add SVG smile arc path
CONFIDENCE: 0.85`,

    // Execute atom 1
    `STEP1_READ: Read file
STEP2_CONTEXT: Empty
STEP3_IMPACT: None
STEP4_DECIDE: Add gradient
STEP5_PREDICT: Gradient visible
STEP6_EXECUTE: Added div
STEP7_VERIFY: Build passes
STEP8_REPORT: Done
CONFIDENCE: 0.9`,

    // Execute atom 2
    `STEP1_READ: Read file
STEP2_CONTEXT: Gradient exists
STEP3_IMPACT: None
STEP4_DECIDE: Add SVG
STEP5_PREDICT: Arc visible
STEP6_EXECUTE: Added SVG
STEP7_VERIFY: Build passes
STEP8_REPORT: Done
CONFIDENCE: 0.85`,
  );

  engine.providers.register({
    name: "mock",
    supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o", "gpt-4o-mini"],
    generate: mock.generate.bind(mock),
  });

  const orchestrator = new Orchestrator(engine);

  // Collect events
  const events: OrchestratorEvent[] = [];
  orchestrator.on(e => events.push(e));

  // ─── TESTS ──────────────────────────────────────────────

  await test("Full pipeline runs without error", async () => {
    const result = await orchestrator.run("Dental clinic website with award-winning hero");
    assert.equal(result.success, true);
    assert.ok(result.totalThoughts > 0, `Expected > 0 thoughts, got ${result.totalThoughts}`);
    assert.ok(result.totalTokens > 0);
  });

  await test("Pipeline emitted phase events", async () => {
    const phaseStarts = events.filter(e => e.type === "phase_start");
    assert.ok(phaseStarts.length > 0);

    const phases = phaseStarts.map(e => (e as any).phase);
    assert.ok(phases.includes("vision"));
    assert.ok(phases.includes("decompose"));
    assert.ok(phases.includes("research"));
    assert.ok(phases.includes("execute"));
  });

  await test("Pipeline emitted thought_complete events", async () => {
    const thoughtEvents = events.filter(e => e.type === "thought_complete");
    assert.ok(thoughtEvents.length >= 4, `Expected >= 4 thought events, got ${thoughtEvents.length}`);
  });

  await test("Pipeline completed successfully", async () => {
    const complete = events.find(e => e.type === "pipeline_complete");
    assert.ok(complete);
  });

  await test("All thoughts persisted to disk", async () => {
    const thoughts = engine.thoughts.list();
    assert.ok(thoughts.length >= 4, `Expected >= 4, got ${thoughts.length}`);
    assert.ok(thoughts.every(t => t.status === "done"));
  });

  // ─── SUMMARY ──────────────────────────────────────────────

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
