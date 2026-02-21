/**
 * FOREMAN — Context Intelligence Tests
 *
 * Tests for layer-aware budgeting, relevance scoring,
 * progressive summarization, decision anchoring, and cross-chain context.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Thought, Layer } from "./types.js";
import {
  computeLayerBudget,
  scoreThoughts,
  formatThoughtAtTier,
  buildIntelligentContext,
  extractCrossChainContext,
} from "./context-intelligence.js";

// ─── HELPERS ─────────────────────────────────────────────────

function makeThought(overrides: Partial<Thought> & { id: string; layer: Layer }): Thought {
  return {
    chainId: "chain_test",
    input: "Test input",
    contextRefs: [],
    reasoning: "Test reasoning",
    output: "Test output",
    confidence: 0.7,
    needsResearch: false,
    needsVerification: false,
    status: "done",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── LAYER-AWARE BUDGET ──────────────────────────────────────

describe("layer-aware budget", () => {
  it("visioner gets largest share", () => {
    const vis = computeLayerBudget("visioner", 128_000);
    const worker = computeLayerBudget("worker", 128_000);
    assert.ok(vis.maxTokens > worker.maxTokens,
      `Visioner (${vis.maxTokens}) should get more than worker (${worker.maxTokens})`);
  });

  it("budget accounts for response reserve", () => {
    const budget = computeLayerBudget("visioner", 100_000, 10_000);
    // 100k - 10k reserve = 90k available, 40% = 36k
    assert.ok(budget.maxTokens <= 36_000);
    assert.ok(budget.maxTokens > 30_000);
  });

  it("each layer has appropriate recent count", () => {
    const vis = computeLayerBudget("visioner", 128_000);
    const worker = computeLayerBudget("worker", 128_000);
    assert.ok(vis.recentFullCount > worker.recentFullCount);
  });

  it("all layer shares sum to 1.0", () => {
    const layers: Layer[] = ["visioner", "strategist", "researcher", "worker"];
    const total = layers.reduce((sum, l) => {
      return sum + computeLayerBudget(l, 100_000).share;
    }, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001, `Shares should sum to 1.0, got ${total}`);
  });
});

// ─── THOUGHT RELEVANCE SCORING ───────────────────────────────

describe("thought relevance scoring", () => {
  it("scores recent thoughts higher than old ones", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "worker", input: "Setup TypeScript config", output: "tsconfig created" }),
      makeThought({ id: "t_002", layer: "worker", input: "Build component system", output: "components ready" }),
      makeThought({ id: "t_003", layer: "worker", input: "Add TypeScript types", output: "types added" }),
    ];

    const scored = scoreThoughts(thoughts, "Fix TypeScript type error", "worker");
    // t_003 should score highest (recent + relevant)
    assert.equal(scored[0].thought.id, "t_003");
  });

  it("anchors high-confidence done decisions", () => {
    const thoughts = [
      makeThought({
        id: "t_anchor",
        layer: "visioner",
        input: "Core architecture decision",
        output: "Use event-driven architecture",
        confidence: 0.95,
        status: "done",
      }),
      makeThought({
        id: "t_normal",
        layer: "worker",
        input: "Fix CSS margin",
        output: "margin fixed",
        confidence: 0.6,
        status: "done",
      }),
    ];

    const scored = scoreThoughts(thoughts, "Something unrelated entirely", "worker");
    const anchor = scored.find(s => s.thought.id === "t_anchor");
    assert.ok(anchor, "Anchor should be present");
    assert.equal(anchor.relevanceScore, 1.0, "Anchored decisions get max score");
    assert.equal(anchor.tier, "full", "Anchored decisions are always full tier");
  });

  it("boosts same-layer thoughts", () => {
    const thoughts = [
      makeThought({ id: "t_worker", layer: "worker", input: "Build button", output: "button done" }),
      makeThought({ id: "t_visioner", layer: "visioner", input: "Build button", output: "button vision" }),
    ];

    const scored = scoreThoughts(thoughts, "Build button component", "worker");
    const workerScore = scored.find(s => s.thought.id === "t_worker")!.relevanceScore;
    const visionerScore = scored.find(s => s.thought.id === "t_visioner")!.relevanceScore;

    assert.ok(workerScore > visionerScore,
      `Same-layer thought (${workerScore.toFixed(3)}) should score higher than cross-layer (${visionerScore.toFixed(3)})`);
  });
});

// ─── PROGRESSIVE SUMMARIZATION ───────────────────────────────

describe("progressive summarization", () => {
  it("full tier includes reasoning and protocol", () => {
    const thought = makeThought({
      id: "t_full",
      layer: "worker",
      input: "Build hero section",
      reasoning: "Canvas2D is better for performance",
      output: "Hero section built with Canvas2D",
      workerProtocol: {
        step1_read: "Read hero.ts",
        step2_context: "Existing canvas setup",
        step3_impact: "Visual change",
        step4_decide: "Use requestAnimationFrame loop",
        step5_predict: "Smooth 60fps animation",
        step6_execute: "Applied changes",
        step7_verify: "Build passes, animation smooth",
        step8_report: "Hero section complete",
      },
    });

    const text = formatThoughtAtTier(thought, "full");
    assert.ok(text.includes("Reasoning"), "Full should include reasoning");
    assert.ok(text.includes("Decision"), "Full should include decision");
    assert.ok(text.includes("Verified"), "Full should include verification");
  });

  it("condensed tier is shorter than full", () => {
    const thought = makeThought({
      id: "t_cond",
      layer: "worker",
      input: "Build component",
      output: "Component built successfully with all props",
      reasoning: "Long reasoning about architecture decisions and trade-offs",
    });

    const full = formatThoughtAtTier(thought, "full");
    const condensed = formatThoughtAtTier(thought, "condensed");
    assert.ok(condensed.length < full.length,
      `Condensed (${condensed.length}) should be shorter than full (${full.length})`);
    assert.ok(!condensed.includes("Reasoning"), "Condensed should not include reasoning");
  });

  it("headline tier is a single line", () => {
    const thought = makeThought({
      id: "t_head",
      layer: "strategist",
      input: "Decompose into blocks",
      output: "5 blocks identified",
    });

    const headline = formatThoughtAtTier(thought, "headline");
    const lines = headline.split("\n").filter(l => l.trim());
    assert.equal(lines.length, 1, `Headline should be 1 line, got ${lines.length}`);
  });
});

// ─── INTELLIGENT CONTEXT BUILDER ─────────────────────────────

describe("buildIntelligentContext", () => {
  it("builds context within budget", () => {
    const thoughts: Thought[] = [];
    for (let i = 0; i < 20; i++) {
      thoughts.push(makeThought({
        id: `t_${String(i).padStart(3, "0")}`,
        layer: "worker",
        input: `Task ${i}: Build component ${i}`,
        output: `Component ${i} built with all features and tests passing`,
        reasoning: `Analyzed requirements, chose approach ${i}, implemented and verified`,
        confidence: 0.5 + Math.random() * 0.4,
      }));
    }

    const result = buildIntelligentContext({
      thoughts,
      currentInput: "Build component 19 with TypeScript",
      currentLayer: "worker",
      contextWindowTokens: 128_000,
    });

    assert.ok(result.text.length > 0, "Should produce context text");
    assert.ok(result.estimatedTokens > 0, "Should use some tokens");
    assert.ok(result.tiers.full > 0, "Should have some full thoughts");
  });

  it("includes chain summary when provided", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "worker", input: "Task 1", output: "Done 1" }),
    ];

    const result = buildIntelligentContext({
      thoughts,
      currentInput: "Next task",
      currentLayer: "worker",
      contextWindowTokens: 128_000,
      chainSummary: "Previously we built the foundation and set up TypeScript",
    });

    assert.ok(result.text.includes("Chain Summary"));
    assert.ok(result.text.includes("foundation"));
  });

  it("includes parent chain context", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "worker", input: "Task", output: "Done" }),
    ];

    const result = buildIntelligentContext({
      thoughts,
      currentInput: "Worker task",
      currentLayer: "worker",
      contextWindowTokens: 128_000,
      parentChainSummary: "Strategist decided to use microservices architecture",
    });

    assert.ok(result.text.includes("Parent Chain Context"));
    assert.ok(result.text.includes("microservices"));
  });

  it("visioner gets more context than worker", () => {
    const thoughts: Thought[] = [];
    for (let i = 0; i < 10; i++) {
      thoughts.push(makeThought({
        id: `t_${i}`,
        layer: "visioner",
        input: `Vision aspect ${i}`,
        output: `Vision output ${i} with detailed analysis`,
      }));
    }

    const visResult = buildIntelligentContext({
      thoughts,
      currentInput: "Next vision step",
      currentLayer: "visioner",
      contextWindowTokens: 100_000,
    });

    const workerResult = buildIntelligentContext({
      thoughts,
      currentInput: "Next vision step",
      currentLayer: "worker",
      contextWindowTokens: 100_000,
    });

    assert.ok(visResult.estimatedTokens >= workerResult.estimatedTokens,
      `Visioner (${visResult.estimatedTokens}) should get >= worker (${workerResult.estimatedTokens})`);
  });
});

// ─── CROSS-CHAIN CONTEXT ─────────────────────────────────────

describe("cross-chain context", () => {
  it("extracts relevant parent thoughts for child goal", () => {
    const parentThoughts = [
      makeThought({
        id: "t_strat_1",
        layer: "strategist",
        input: "API design for user management",
        output: "REST API with JWT auth, CRUD endpoints for users",
      }),
      makeThought({
        id: "t_strat_2",
        layer: "strategist",
        input: "Database schema design",
        output: "PostgreSQL with users, sessions, and roles tables",
      }),
      makeThought({
        id: "t_strat_3",
        layer: "strategist",
        input: "Frontend component architecture",
        output: "React with Zustand state management",
      }),
    ];

    const context = extractCrossChainContext(
      parentThoughts,
      "Implement user login API endpoint",
      2000,
    );

    assert.ok(context.length > 0, "Should extract some context");
    // API-related thought should be most relevant
    assert.ok(context.includes("API") || context.includes("user"),
      "Should include API-related parent context");
  });

  it("respects token budget", () => {
    const parentThoughts: Thought[] = [];
    for (let i = 0; i < 20; i++) {
      parentThoughts.push(makeThought({
        id: `t_parent_${i}`,
        layer: "strategist",
        input: `Strategy ${i}: ${"detailed ".repeat(50)}`,
        output: `Output ${i}: ${"result ".repeat(50)}`,
      }));
    }

    const context = extractCrossChainContext(parentThoughts, "child task", 500);
    // 500 tokens ≈ 2000 chars max
    assert.ok(context.length < 3000, `Context should be bounded: ${context.length} chars`);
  });

  it("returns empty for no parent thoughts", () => {
    const context = extractCrossChainContext([], "child goal");
    assert.equal(context, "");
  });
});
