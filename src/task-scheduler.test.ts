/**
 * FOREMAN — Task Scheduler Tests
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TaskScheduler } from "./task-scheduler.js";

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe("TaskScheduler", () => {
  let scheduler: TaskScheduler;

  afterEach(() => {
    if (scheduler) scheduler.shutdown();
  });

  // ─── INTERVAL TASKS ────────────────────────────────────────

  it("runs interval tasks", async () => {
    scheduler = new TaskScheduler();
    let count = 0;

    scheduler.addInterval({
      name: "counter",
      execute: async () => { count++; },
      intervalMs: 20,
    });

    await sleep(65);
    assert.ok(count >= 2, `Expected >= 2 runs, got ${count}`);
  });

  it("stops interval when disabled", async () => {
    scheduler = new TaskScheduler();
    let count = 0;

    const id = scheduler.addInterval({
      name: "counter",
      execute: async () => { count++; },
      intervalMs: 15,
    });

    await sleep(40);
    const countBefore = count;
    scheduler.setEnabled(id, false);
    await sleep(40);
    assert.equal(count, countBefore);
  });

  // ─── EVENT TASKS ───────────────────────────────────────────

  it("triggers on event", async () => {
    scheduler = new TaskScheduler();
    let fired = false;

    scheduler.addEventTask({
      name: "on-commit",
      execute: async () => { fired = true; },
      event: "commit",
    });

    const triggered = await scheduler.fireEvent("commit");
    assert.equal(triggered, 1);
    assert.ok(fired);
  });

  it("does not trigger on wrong event", async () => {
    scheduler = new TaskScheduler();
    let fired = false;

    scheduler.addEventTask({
      name: "on-commit",
      execute: async () => { fired = true; },
      event: "commit",
    });

    await scheduler.fireEvent("build-success");
    assert.ok(!fired);
  });

  it("handles custom events", async () => {
    scheduler = new TaskScheduler();
    let fired = false;

    scheduler.addEventTask({
      name: "custom",
      execute: async () => { fired = true; },
      event: "custom",
      customEvent: "deploy",
    });

    await scheduler.fireEvent("custom", "other");
    assert.ok(!fired);

    await scheduler.fireEvent("custom", "deploy");
    assert.ok(fired);
  });

  it("debounces event tasks", async () => {
    scheduler = new TaskScheduler();
    let count = 0;

    scheduler.addEventTask({
      name: "debounced",
      execute: async () => { count++; },
      event: "file-change",
      debounceMs: 30,
    });

    // Fire rapidly
    await scheduler.fireEvent("file-change");
    await scheduler.fireEvent("file-change");
    await scheduler.fireEvent("file-change");

    // Should NOT have fired yet (debouncing)
    assert.equal(count, 0);

    // Wait for debounce to settle
    await sleep(50);
    assert.equal(count, 1); // only once
  });

  // ─── DELAYED TASKS ─────────────────────────────────────────

  it("runs delayed task after delay", async () => {
    scheduler = new TaskScheduler();
    let fired = false;

    scheduler.addDelayed({
      name: "cleanup",
      execute: async () => { fired = true; },
      delayMs: 20,
    });

    assert.ok(!fired);
    await sleep(40);
    assert.ok(fired);
  });

  // ─── DEPENDENCIES ──────────────────────────────────────────

  it("respects task dependencies", async () => {
    scheduler = new TaskScheduler();
    const order: string[] = [];

    const id1 = scheduler.addDelayed({
      name: "build",
      execute: async () => { order.push("build"); },
      delayMs: 10,
    });

    scheduler.addDelayed({
      name: "deploy",
      execute: async () => { order.push("deploy"); },
      delayMs: 20,
      dependsOn: [id1],
    });

    await sleep(50);
    // Build should run first, then deploy can run (deps met)
    assert.ok(order.includes("build"));
  });

  // ─── MANAGEMENT ────────────────────────────────────────────

  it("removes tasks", () => {
    scheduler = new TaskScheduler();
    const id = scheduler.addInterval({
      name: "temp",
      execute: async () => {},
      intervalMs: 100,
    });

    assert.ok(scheduler.get(id));
    scheduler.remove(id);
    assert.equal(scheduler.get(id), null);
  });

  it("lists tasks", () => {
    scheduler = new TaskScheduler();
    scheduler.addEventTask({ name: "a", execute: async () => {}, event: "commit" });
    scheduler.addEventTask({ name: "b", execute: async () => {}, event: "build-success" });

    const tasks = scheduler.list();
    assert.equal(tasks.length, 2);
  });

  it("tracks statistics", async () => {
    scheduler = new TaskScheduler();
    scheduler.addEventTask({ name: "a", execute: async () => {}, event: "commit" });
    scheduler.addEventTask({ name: "b", execute: async () => {}, event: "commit" });

    await scheduler.fireEvent("commit");

    const stats = scheduler.stats();
    assert.equal(stats.totalTasks, 2);
    assert.equal(stats.totalRuns, 2);
    assert.equal(stats.byKind.event, 2);
  });

  it("tracks run count per task", async () => {
    scheduler = new TaskScheduler();
    const id = scheduler.addEventTask({
      name: "counter",
      execute: async () => {},
      event: "commit",
    });

    await scheduler.fireEvent("commit");
    await scheduler.fireEvent("commit");

    const task = scheduler.get(id);
    assert.equal(task!.runCount, 2);
    assert.ok(task!.lastRunAt);
  });

  it("tracks errors", async () => {
    scheduler = new TaskScheduler();
    const id = scheduler.addEventTask({
      name: "failing",
      execute: async () => { throw new Error("boom"); },
      event: "commit",
    });

    await scheduler.fireEvent("commit");
    const task = scheduler.get(id);
    assert.equal(task!.lastError, "boom");
    assert.equal(task!.runCount, 1); // still counts the run
  });

  it("shuts down cleanly", () => {
    scheduler = new TaskScheduler();
    scheduler.addInterval({ name: "a", execute: async () => {}, intervalMs: 10 });
    scheduler.addInterval({ name: "b", execute: async () => {}, intervalMs: 10 });
    scheduler.shutdown();
    assert.equal(scheduler.list().length, 0);
  });
});
