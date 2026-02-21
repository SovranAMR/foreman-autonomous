/**
 * FOREMAN — Parser Tests
 *
 * Her katmanın parse formatını test eder.
 * Parse başarısızlığında doğru hata döndüğünü doğrular.
 */

import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVisionResponse,
  parseDecomposeResponse,
  parseResearchResponse,
  parseAtomizeResponse,
  parseWorkerResponse,
  parseNumberedList,
  buildRetryPrompt,
} from "./parser.js";

// ─── VISION PARSER ───────────────────────────────────────────

await test("Vision: parses valid response", () => {
  const r = parseVisionResponse(`REASONING: Premium dental feel
OUTPUT: Dark theme with gold accents
CONFIDENCE: 0.9
NEEDS_RESEARCH: false`);

  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.reasoning, "Premium dental feel");
    assert.equal(r.data.output, "Dark theme with gold accents");
    assert.equal(r.data.confidence, 0.9);
    assert.equal(r.data.needsResearch, false);
  }
});

await test("Vision: fails on missing REASONING", () => {
  const r = parseVisionResponse(`OUTPUT: Something
CONFIDENCE: 0.8`);
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(r.error.missing.includes("REASONING"));
});

await test("Vision: fails on missing OUTPUT", () => {
  const r = parseVisionResponse(`REASONING: I thought about it
CONFIDENCE: 0.8`);
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(r.error.missing.includes("OUTPUT"));
});

await test("Vision: defaults confidence to 0.7 if missing", () => {
  const r = parseVisionResponse(`REASONING: reason
OUTPUT: output`);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.confidence, 0.7);
});

// ─── DECOMPOSE PARSER ────────────────────────────────────────

await test("Decompose: parses numbered blocks", () => {
  const r = parseDecomposeResponse(`REASONING: logical breakdown
OUTPUT:
Block 1: Hero section with gradient
Block 2: Services grid with glassmorphism
Block 3: Team section with profiles
CONFIDENCE: 0.85`);

  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.blocks.length, 3);
    assert.ok(r.data.blocks[0].includes("Hero section"));
    assert.ok(r.data.blocks[1].includes("Services grid"));
    assert.equal(r.data.confidence, 0.85);
  }
});

await test("Decompose: caps at 8 blocks", () => {
  const r = parseDecomposeResponse(`REASONING: many blocks
OUTPUT:
1. Block one
2. Block two
3. Block three
4. Block four
5. Block five
6. Block six
7. Block seven
8. Block eight
9. Block nine should be cut
10. Block ten should be cut
CONFIDENCE: 0.8`);

  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.blocks.length, 8);
});

await test("Decompose: fails on empty blocks", () => {
  const r = parseDecomposeResponse(`REASONING: logic
OUTPUT: no numbered items here
CONFIDENCE: 0.8`);
  assert.ok(!r.ok);
});

await test("Decompose: fails on missing REASONING", () => {
  const r = parseDecomposeResponse(`OUTPUT:
1. Something
CONFIDENCE: 0.8`);
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(r.error.missing.includes("REASONING"));
});

// ─── RESEARCH PARSER ─────────────────────────────────────────

await test("Research: parses valid response", () => {
  const r = parseResearchResponse(`REASONING: looked at top sites
FINDINGS: Minimalist heroes work best. Apple uses single gradient.
RELEVANCE: 0.9
RISKS: Heavy animations cause FPS drops`);

  assert.ok(r.ok);
  if (r.ok) {
    assert.ok(r.data.findings.includes("Minimalist"));
    assert.equal(r.data.relevance, 0.9);
    assert.ok(r.data.risks.includes("FPS"));
  }
});

await test("Research: fails on missing FINDINGS", () => {
  const r = parseResearchResponse(`REASONING: looked at things
RELEVANCE: 0.5`);
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(r.error.missing.includes("FINDINGS"));
});

await test("Research: works without REASONING", () => {
  const r = parseResearchResponse(`FINDINGS: Found some things
RELEVANCE: 0.7
RISKS: None`);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.reasoning, "Direct research output");
});

// ─── ATOMIZE PARSER ──────────────────────────────────────────

await test("Atomize: parses numbered atoms", () => {
  const r = parseAtomizeResponse(`OUTPUT:
1. Create background gradient div
2. Add SVG smile arc path
3. Connect GSAP draw animation
CONFIDENCE: 0.85`);

  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.atoms.length, 3);
    assert.ok(r.data.atoms[0].includes("gradient"));
  }
});

await test("Atomize: caps at 6 atoms", () => {
  const r = parseAtomizeResponse(`OUTPUT:
1. Atom one text here
2. Atom two text here
3. Atom three text here
4. Atom four text here
5. Atom five text here
6. Atom six text here
7. Atom seven should be cut
8. Atom eight should be cut
CONFIDENCE: 0.8`);

  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.atoms.length, 6);
});

await test("Atomize: fails on no parseable atoms", () => {
  const r = parseAtomizeResponse(`Some random text without structure`);
  assert.ok(!r.ok);
});

// ─── WORKER PARSER ───────────────────────────────────────────

await test("Worker: parses all 8 steps", () => {
  const r = parseWorkerResponse(`STEP1_READ: Read HeroSection.tsx
STEP2_CONTEXT: Empty component
STEP3_IMPACT: No existing code affected
STEP4_DECIDE: Add gradient div
STEP5_PREDICT: Gold gradient visible
STEP6_EXECUTE: Added div with radial gradient
STEP7_VERIFY: Build passes
STEP8_REPORT: Background gradient added
CONFIDENCE: 0.9`);

  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.protocol.step1_read, "Read HeroSection.tsx");
    assert.equal(r.data.protocol.step4_decide, "Add gradient div");
    assert.equal(r.data.protocol.step8_report, "Background gradient added");
    assert.equal(r.data.confidence, 0.9);
  }
});

await test("Worker: fails on missing steps", () => {
  const r = parseWorkerResponse(`STEP1_READ: Read file
STEP6_EXECUTE: Wrote code
CONFIDENCE: 0.7`);

  assert.ok(!r.ok);
  if (!r.ok) {
    // STEP2-5, STEP7-8 eksik
    assert.ok(r.error.missing.includes("STEP2_CONTEXT"));
    assert.ok(r.error.missing.includes("STEP7_VERIFY"));
  }
});

await test("Worker: fails on completely unparseable response", () => {
  const r = parseWorkerResponse(`I created the gradient div and it looks great.`);
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.error.missing.length, 8);
});

// ─── NUMBERED LIST PARSER ────────────────────────────────────

await test("parseNumberedList: handles multiple formats", () => {
  const items = parseNumberedList(`Block 1: First block
2. Second block
- Third block
* Fourth block`);
  assert.equal(items.length, 4);
});

await test("parseNumberedList: skips short items", () => {
  const items = parseNumberedList(`1. OK
2. This is a proper block description`);
  assert.equal(items.length, 1);
});

// ─── RETRY PROMPT ────────────────────────────────────────────

await test("buildRetryPrompt: includes missing fields and format guide", () => {
  const prompt = buildRetryPrompt(
    { missing: ["STEP2_CONTEXT", "STEP3_IMPACT"], raw: "some text" },
    "execute",
  );
  assert.ok(prompt.includes("STEP2_CONTEXT"));
  assert.ok(prompt.includes("STEP3_IMPACT"));
  assert.ok(prompt.includes("STEP1_READ"));
  assert.ok(prompt.includes("STEP8_REPORT"));
});

await test("buildRetryPrompt: includes raw text (truncated)", () => {
  const longText = "x".repeat(2000);
  const prompt = buildRetryPrompt({ missing: ["OUTPUT"], raw: longText }, "vision");
  assert.ok(prompt.length < 2500); // raw truncated to 1000
});

// ─── RESULTS ─────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
