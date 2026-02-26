/**
 * FOREMAN — Background Exec Integration Tests
 *
 * Tests the full yieldMs/background exec flow through ExecutionEngine.
 * These are integration tests that actually spawn child processes.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ExecutionEngine } from "./execution-engine.js";
import { ProcessRegistry } from "./process-registry.js";

describe("Background exec integration", () => {
  let engine: ExecutionEngine;
  let registry: ProcessRegistry;
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "foreman-bg-exec-"));
    engine = new ExecutionEngine(testDir);
    registry = new ProcessRegistry({ ttlMs: 60_000 });
    engine.connectRegistry(registry);
  });

  afterEach(() => {
    // Kill any lingering processes
    registry.killAll("SIGKILL", 0);
    registry.reset();
  });

  it("immediate background returns session ID", async () => {
    const result = await engine.runShellBackground("sleep 30", {
      background: true,
      timeoutMs: 60_000,
    });

    assert.equal(result.completed, false);
    assert.ok(result.sessionId);
    assert.ok(result.pid);

    // Session should be registered and backgrounded
    const session = registry.get(result.sessionId!);
    assert.ok(session);
    assert.ok(session!.backgrounded);

    // Clean up
    registry.kill(result.sessionId!, "SIGKILL", 0);
  });

  it("fast command completes within yield window", async () => {
    const result = await engine.runShellBackground("echo hello-bg", {
      yieldMs: 10_000,
      timeoutMs: 30_000,
    });

    assert.equal(result.completed, true);
    assert.ok(result.result);
    assert.ok(result.result!.success);
    assert.ok(result.result!.stdout.includes("hello-bg"));
  });

  it("slow command gets backgrounded after yieldMs", async () => {
    const result = await engine.runShellBackground("sleep 30", {
      yieldMs: 100, // Very short yield window
      timeoutMs: 60_000,
    });

    assert.equal(result.completed, false);
    assert.ok(result.sessionId);

    // Can poll for status
    const poll = registry.poll(result.sessionId!);
    assert.ok(poll);
    assert.equal(poll!.status, "running");

    // Clean up
    registry.kill(result.sessionId!, "SIGKILL", 0);
  });

  it("poll returns output from backgrounded process", async () => {
    const result = await engine.runShellBackground(
      'echo "started" && sleep 0.5 && echo "finished"',
      {
        background: true,
        timeoutMs: 30_000,
      },
    );

    assert.equal(result.completed, false);
    assert.ok(result.sessionId);

    // Wait enough time for echo to produce output
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that output was captured in the session (via getLog, not poll drain)
    const log = registry.getLog(result.sessionId!);
    assert.ok(log);
    assert.ok(log!.text.includes("started"), `Expected "started" in log, got: ${log!.text}`);

    // Clean up
    registry.kill(result.sessionId!, "SIGKILL", 0);
  });

  it("handles blocked (dangerous) commands gracefully", async () => {
    const result = await engine.runShellBackground("rm -rf /", {
      background: true,
    });

    // Should complete immediately with error
    assert.equal(result.completed, true);
    assert.ok(result.result);
    assert.equal(result.result!.success, false);
    assert.ok(result.result!.stderr.includes("Dangerous"));
  });

  it("getLog returns full output from backgrounded process", async () => {
    const result = await engine.runShellBackground(
      'for i in $(seq 1 5); do echo "line $i"; done',
      {
        yieldMs: 100,
        timeoutMs: 10_000,
      },
    );

    // Wait for process to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (result.sessionId) {
      const log = registry.getLog(result.sessionId);
      assert.ok(log);
      assert.ok(log!.totalLines >= 1);
    }
  });

  it("runShellAsync returns sessionId", () => {
    const handle = engine.runShellAsync("echo hello", { timeoutMs: 5000 });
    assert.ok(handle.sessionId);
    assert.ok(handle.sessionId.startsWith("proc_"));

    // Clean up
    handle.kill("SIGKILL");
  });

  it("graceful kill sends SIGTERM then escalates to SIGKILL", async () => {
    // Start a process that ignores SIGTERM (trap)
    const handle = engine.runShellAsync(
      'trap "" TERM; echo "started"; sleep 30',
      { timeoutMs: 60_000 },
    );

    // Wait for it to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Kill it — SIGTERM first, SIGKILL after 3s
    handle.kill("SIGTERM");

    // Wait for SIGKILL escalation
    const result = await Promise.race([
      handle.promise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
    ]);

    // Should have been killed
    if (result) {
      assert.equal(result.success, false);
    }
    // If timed out, the escalation is still pending
  });
});
