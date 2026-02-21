/**
 * FOREMAN — Rate Limiter Smoke Test
 */

import { strict as assert } from "node:assert";
import { RateLimiter, BudgetExceededError, DEFAULT_RATE_LIMIT_CONFIG } from "./rate-limiter.js";

const PASS = "✅";
const FAIL = "❌";
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    return result
      .then(() => { console.log(`${PASS} ${name}`); passed++; })
      .catch((err) => { console.log(`${FAIL} ${name}`); console.error(`   ${err}`); failed++; });
  }
  try {
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.error(`   ${err}`);
    failed++;
  }
}

async function run() {
  // ─── MODEL ROTATION ─────────────────────────────────────────

  await test("currentModel() → primary by default", () => {
    const rl = new RateLimiter();
    assert.equal(rl.currentModel(), "claude-sonnet");
  });

  await test("onRateLimited() rotates to fallback", async () => {
    const rl = new RateLimiter({
      minDelayBetweenCalls: 0,
      backoffBaseMs: 10, // fast for testing
    });
    const next = await rl.onRateLimited();
    assert.equal(next, "gpt-4o-mini"); // first fallback
  });

  await test("onRateLimited() cycles through fallbacks", async () => {
    const rl = new RateLimiter({ minDelayBetweenCalls: 0, backoffBaseMs: 10 });
    await rl.onRateLimited(); // → gpt-4o-mini
    const second = await rl.onRateLimited(); // → gemini-flash
    assert.equal(second, "gemini-flash");
  });

  await test("onRateLimited() wraps back to primary", async () => {
    const rl = new RateLimiter({ minDelayBetweenCalls: 0, backoffBaseMs: 10 });
    await rl.onRateLimited(); // → gpt-4o-mini
    await rl.onRateLimited(); // → gemini-flash
    const third = await rl.onRateLimited(); // → back to primary
    assert.equal(third, "claude-sonnet");
  });

  await test("onSuccess() resets retry counter", () => {
    const rl = new RateLimiter();
    rl.onSuccess();
    // Should not throw — retries reset
    assert.equal(rl.currentModel(), "claude-sonnet");
  });

  await test("resetModel() goes back to primary", async () => {
    const rl = new RateLimiter({ minDelayBetweenCalls: 0, backoffBaseMs: 10 });
    await rl.onRateLimited(); // rotate
    rl.resetModel();
    assert.equal(rl.currentModel(), "claude-sonnet");
  });

  await test("maxRetries exceeded → throws", async () => {
    const rl = new RateLimiter({
      minDelayBetweenCalls: 0,
      maxRetries: 2,
      backoffBaseMs: 10, // fast for testing
    });
    await rl.onRateLimited(); // 1
    await rl.onRateLimited(); // 2
    try {
      await rl.onRateLimited(); // 3 → should throw
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.ok(err.message.includes("Max retries"));
    }
  });

  // ─── TOKEN BUDGET ──────────────────────────────────────────

  await test("recordTokens() tracks usage", () => {
    const rl = new RateLimiter();
    rl.recordTokens(500);
    rl.recordTokens(300);
    const usage = rl.tokenUsage();
    assert.equal(usage.thought, 800);
    assert.equal(usage.chain, 800);
    assert.equal(usage.session, 800);
  });

  await test("recordTokens() throws on thought budget exceeded", () => {
    const rl = new RateLimiter({
      budget: { perThought: 1000, perChain: 50000, perSession: 500000 },
    });
    rl.recordTokens(900);
    assert.throws(
      () => rl.recordTokens(200), // 1100 > 1000
      BudgetExceededError,
    );
  });

  await test("resetThoughtBudget() resets thought counter only", () => {
    const rl = new RateLimiter();
    rl.recordTokens(500);
    rl.resetThoughtBudget();
    const usage = rl.tokenUsage();
    assert.equal(usage.thought, 0);
    assert.equal(usage.chain, 500); // chain still tracked
    assert.equal(usage.session, 500);
  });

  await test("resetChainBudget() resets chain + thought", () => {
    const rl = new RateLimiter();
    rl.recordTokens(500);
    rl.resetChainBudget();
    const usage = rl.tokenUsage();
    assert.equal(usage.thought, 0);
    assert.equal(usage.chain, 0);
    assert.equal(usage.session, 500); // session still tracked
  });

  // ─── THROTTLE (basic) ─────────────────────────────────────

  await test("acquire() enforces min delay", async () => {
    const rl = new RateLimiter({ minDelayBetweenCalls: 100 });
    const start = Date.now();
    await rl.acquire();
    await rl.acquire(); // should wait ~100ms
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 90, `Expected >=90ms, got ${elapsed}ms`);
  });

  // ─── SUMMARY ──────────────────────────────────────────────

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
