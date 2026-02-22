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
    `STEP1_READ: Read HeroSection.tsx: 120 lines, main container at line 15, no gradient present
STEP2_CONTEXT: Component uses Tailwind classes, motion.div wrapper, no existing background styling
STEP3_IMPACT: Adding gradient div won't affect text overlay since z-index will be lower
STEP4_DECIDE: Line 16: add gradient div with radial-gradient from gold to transparent, z-index: -1
STEP5_PREDICT: Warm gold gradient visible behind hero text, blending with dark background
STEP6_EXECUTE: Added div with className="absolute inset-0" and radial gradient background
STEP7_VERIFY: Build passes ✔, visual check shows gradient rendering correctly
STEP8_REPORT: Background gradient added. No unexpected side effects.
CONFIDENCE: 0.9`,

    // Execute atom 2
    `STEP1_READ: Read HeroSection.tsx: 130 lines after previous edit, gradient div at line 16, SVG area empty
STEP2_CONTEXT: Gradient div exists at z-index:-1, need SVG above it at z-index:0 for visibility
STEP3_IMPACT: SVG will overlay gradient but not block text (text z-index:10)
STEP4_DECIDE: Line 20: add SVG element with smile arc path, viewBox 0 0 500 200
STEP5_PREDICT: Gold arc visible over gradient, creating the smile identity
STEP6_EXECUTE: Added SVG with path d="M50,150 Q250,50 450,150" stroke gold fill none
STEP7_VERIFY: Build passes ✔, 5 tests pass, arc renders at correct position
STEP8_REPORT: SVG smile arc added successfully. Path length approx 500 units.
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
