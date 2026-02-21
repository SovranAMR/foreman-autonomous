/**
 * FOREMAN — Command Queue Tests
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CommandQueue } from "./command-queue.js";

describe("CommandQueue", () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  afterEach(() => {
    queue.reset();
  });

  // ─── BASIC EXECUTION ───────────────────────────────────────

  it("executes a task", async () => {
    const result = await queue.enqueue({
      execute: async () => 42,
    });
    assert.equal(result, 42);
  });

  it("serializes tasks in same lane", async () => {
    const order: number[] = [];

    const p1 = queue.enqueue({
      execute: async () => {
        await sleep(20);
        order.push(1);
        return 1;
      },
      lane: "main",
    });

    const p2 = queue.enqueue({
      execute: async () => {
        order.push(2);
        return 2;
      },
      lane: "main",
    });

    await Promise.all([p1, p2]);
    assert.deepEqual(order, [1, 2]);
  });

  it("runs tasks in different lanes concurrently", async () => {
    const startTime = Date.now();

    const p1 = queue.enqueue({
      execute: async () => { await sleep(30); return 1; },
      lane: "lane_a",
    });

    const p2 = queue.enqueue({
      execute: async () => { await sleep(30); return 2; },
      lane: "lane_b",
    });

    await Promise.all([p1, p2]);
    const elapsed = Date.now() - startTime;
    // Should complete in ~30ms (parallel), not ~60ms (serial)
    assert.ok(elapsed < 55, `Expected < 55ms but got ${elapsed}ms`);
  });

  // ─── PRIORITY ──────────────────────────────────────────────

  it("executes higher priority tasks first", async () => {
    const order: string[] = [];

    // Block the lane with a slow task
    const blocker = queue.enqueue({
      execute: async () => { await sleep(30); order.push("blocker"); },
      lane: "main",
    });

    // Queue low before high
    const low = queue.enqueue({
      execute: async () => { order.push("low"); },
      lane: "main",
      priority: "low",
    });

    const high = queue.enqueue({
      execute: async () => { order.push("high"); },
      lane: "main",
      priority: "high",
    });

    const critical = queue.enqueue({
      execute: async () => { order.push("critical"); },
      lane: "main",
      priority: "critical",
    });

    await Promise.all([blocker, low, high, critical]);
    // After blocker finishes: critical > high > low
    assert.equal(order[0], "blocker");
    assert.equal(order[1], "critical");
    assert.equal(order[2], "high");
    assert.equal(order[3], "low");
  });

  it("uses layer-based default priority", async () => {
    const order: string[] = [];

    const blocker = queue.enqueue({
      execute: async () => { await sleep(20); order.push("blocker"); },
      lane: "main",
    });

    const worker = queue.enqueue({
      execute: async () => { order.push("worker"); },
      lane: "main",
      layer: "worker", // default: normal
    });

    const visioner = queue.enqueue({
      execute: async () => { order.push("visioner"); },
      lane: "main",
      layer: "visioner", // default: high
    });

    await Promise.all([blocker, worker, visioner]);
    assert.equal(order[1], "visioner");
    assert.equal(order[2], "worker");
  });

  // ─── CONCURRENCY ───────────────────────────────────────────

  it("respects lane concurrency limit", async () => {
    queue.setLaneConcurrency("parallel", 3);
    let maxConcurrent = 0;
    let current = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      queue.enqueue({
        execute: async () => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          await sleep(20);
          current--;
          return i;
        },
        lane: "parallel",
      }),
    );

    await Promise.all(tasks);
    assert.ok(maxConcurrent <= 3, `Max concurrent was ${maxConcurrent}`);
    assert.ok(maxConcurrent >= 2, `Expected >= 2 concurrent but got ${maxConcurrent}`);
  });

  // ─── STATS ─────────────────────────────────────────────────

  it("tracks statistics", async () => {
    await queue.enqueue({ execute: async () => 1, lane: "a" });
    await queue.enqueue({ execute: async () => 2, lane: "b" });

    // Allow .finally() microtask to complete
    await new Promise(r => setTimeout(r, 5));

    const stats = queue.stats();
    assert.equal(stats.totalProcessed, 2);
    assert.equal(stats.queued, 0);
    assert.equal(stats.active, 0);
    assert.ok(stats.lanes.a);
    assert.ok(stats.lanes.b);
  });

  // ─── ERROR HANDLING ────────────────────────────────────────

  it("propagates task errors", async () => {
    await assert.rejects(
      () => queue.enqueue({
        execute: async () => { throw new Error("task failed"); },
      }),
      { message: "task failed" },
    );
  });

  it("continues processing after task error", async () => {
    const results: number[] = [];

    try {
      await queue.enqueue({
        execute: async () => { throw new Error("fail"); },
        lane: "main",
      });
    } catch { /* expected */ }

    const result = await queue.enqueue({
      execute: async () => { results.push(1); return 1; },
      lane: "main",
    });

    assert.equal(result, 1);
    assert.deepEqual(results, [1]);
  });

  // ─── DRAIN MODE ────────────────────────────────────────────

  it("rejects new tasks when draining", async () => {
    const drainPromise = queue.drainAll();

    await assert.rejects(
      () => queue.enqueue({ execute: async () => 1 }),
      { message: /draining/ },
    );

    await drainPromise;
  });

  // ─── QUEUE TIMEOUT ─────────────────────────────────────────

  it("rejects tasks that wait too long", async () => {
    // Block the lane
    const blocker = queue.enqueue({
      execute: async () => { await sleep(200); },
      lane: "main",
    });

    // Queue a task with very short timeout
    const timeout = queue.enqueue({
      execute: async () => "should not run",
      lane: "main",
      queueTimeoutMs: 10,
    });

    // The timeout task should be rejected
    await assert.rejects(
      () => timeout,
      { message: /timed out/ },
    );

    await blocker;
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
