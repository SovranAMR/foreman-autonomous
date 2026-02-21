/**
 * FOREMAN — Process Registry Tests
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProcessRegistry, createSessionId } from "./process-registry.js";

describe("ProcessRegistry", () => {
  let registry: ProcessRegistry;

  beforeEach(() => {
    registry = new ProcessRegistry({ ttlMs: 60_000 });
  });

  // ─── REGISTRATION ──────────────────────────────────────────

  it("registers a session", () => {
    const session = registry.register({
      id: "proc_001",
      command: "npm test",
      pid: 12345,
      thoughtId: "t_001",
      layer: "worker",
    });
    assert.equal(session.id, "proc_001");
    assert.equal(session.command, "npm test");
    assert.equal(session.pid, 12345);
    assert.equal(session.thoughtId, "t_001");
    assert.equal(session.layer, "worker");
    assert.equal(session.status, "running");
  });

  it("generates unique session IDs", () => {
    const id1 = createSessionId();
    const id2 = createSessionId();
    assert.notEqual(id1, id2);
    assert.ok(id1.startsWith("proc_"));
  });

  // ─── OUTPUT TRACKING ───────────────────────────────────────

  it("appends stdout", () => {
    registry.register({ id: "p1", command: "echo hi", pid: 1 });
    registry.appendOutput("p1", "stdout", "hello ");
    registry.appendOutput("p1", "stdout", "world");
    const session = registry.get("p1");
    assert.ok(session);
    assert.equal(session!.stdout, "hello world");
    assert.equal(session!.totalOutputBytes, 11);
  });

  it("appends stderr", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.appendOutput("p1", "stderr", "error happened");
    const session = registry.get("p1");
    assert.equal(session!.stderr, "error happened");
  });

  it("truncates oversized output", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    const bigChunk = "x".repeat(250_000);
    registry.appendOutput("p1", "stdout", bigChunk);
    const session = registry.get("p1");
    assert.ok(session!.stdout.length <= 200_000);
    assert.ok(session!.truncated);
    assert.equal(session!.totalOutputBytes, 250_000);
  });

  it("maintains tail", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.appendOutput("p1", "stdout", "line1\n");
    registry.appendOutput("p1", "stderr", "err1\n");
    const session = registry.get("p1");
    assert.ok(session!.tail.includes("line1"));
    assert.ok(session!.tail.includes("err1"));
  });

  // ─── POLL ──────────────────────────────────────────────────

  it("polls pending output", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.appendOutput("p1", "stdout", "chunk1");
    registry.appendOutput("p1", "stderr", "err1");

    const poll = registry.poll("p1");
    assert.ok(poll);
    assert.equal(poll!.stdout, "chunk1");
    assert.equal(poll!.stderr, "err1");
    assert.equal(poll!.status, "running");

    // Second poll should be empty (drained)
    const poll2 = registry.poll("p1");
    assert.equal(poll2!.stdout, "");
    assert.equal(poll2!.stderr, "");
  });

  it("polls finished session", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.markExited("p1", 0, null);
    const poll = registry.poll("p1");
    assert.ok(poll);
    assert.equal(poll!.status, "completed");
    assert.equal(poll!.exitCode, 0);
  });

  it("returns null for unknown session", () => {
    assert.equal(registry.poll("nonexistent"), null);
  });

  // ─── EXIT ──────────────────────────────────────────────────

  it("marks session as completed on exit code 0", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    const finished = registry.markExited("p1", 0, null);
    assert.ok(finished);
    assert.equal(finished!.status, "completed");
    assert.equal(finished!.exitCode, 0);
    assert.ok(finished!.durationMs >= 0);

    // Should be in finished, not running
    assert.equal(registry.get("p1"), null);
    assert.ok(registry.getFinished("p1"));
  });

  it("marks session as failed on non-zero exit", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    const finished = registry.markExited("p1", 1, null);
    assert.equal(finished!.status, "failed");
  });

  it("marks session as killed", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    const finished = registry.markExited("p1", null, "SIGTERM", "killed");
    assert.equal(finished!.status, "killed");
    assert.equal(finished!.exitSignal, "SIGTERM");
  });

  it("fires onExit callback", () => {
    let callbackFired = false;
    let callbackSession: unknown = null;

    registry.register({
      id: "p1",
      command: "cmd",
      pid: 1,
      onExit: (session) => {
        callbackFired = true;
        callbackSession = session;
      },
    });

    registry.markExited("p1", 0, null);
    assert.ok(callbackFired);
    assert.ok(callbackSession);
  });

  // ─── BACKGROUNDING ────────────────────────────────────────

  it("marks session as backgrounded", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.background("p1");
    const session = registry.get("p1");
    assert.ok(session!.backgrounded);
  });

  // ─── QUERIES ───────────────────────────────────────────────

  it("lists running sessions", () => {
    registry.register({ id: "p1", command: "cmd1", pid: 1 });
    registry.register({ id: "p2", command: "cmd2", pid: 2 });
    assert.equal(registry.listRunning().length, 2);
  });

  it("filters by layer", () => {
    registry.register({ id: "p1", command: "search", pid: 1, layer: "researcher" });
    registry.register({ id: "p2", command: "build", pid: 2, layer: "worker" });
    registry.register({ id: "p3", command: "analyze", pid: 3, layer: "researcher" });

    const researchers = registry.listByLayer("researcher");
    assert.equal(researchers.length, 2);
    assert.ok(researchers.every(s => s.layer === "researcher"));
  });

  it("filters by thought", () => {
    registry.register({ id: "p1", command: "cmd1", pid: 1, thoughtId: "t_001" });
    registry.register({ id: "p2", command: "cmd2", pid: 2, thoughtId: "t_002" });
    registry.register({ id: "p3", command: "cmd3", pid: 3, thoughtId: "t_001" });

    const forThought = registry.listByThought("t_001");
    assert.equal(forThought.length, 2);
  });

  it("filters by chain", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1, chainId: "chain_A" });
    registry.register({ id: "p2", command: "cmd", pid: 2, chainId: "chain_B" });

    const chainA = registry.listByChain("chain_A");
    assert.equal(chainA.length, 1);
    assert.equal(chainA[0].chainId, "chain_A");
  });

  it("lists finished sessions", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.markExited("p1", 0, null);
    assert.equal(registry.listFinished().length, 1);
    assert.equal(registry.listRunning().length, 0);
  });

  // ─── STATS ─────────────────────────────────────────────────

  it("tracks statistics", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1, layer: "worker" });
    registry.register({ id: "p2", command: "cmd", pid: 2, layer: "researcher" });
    registry.register({ id: "p3", command: "cmd", pid: 3, layer: "worker" });
    registry.markExited("p3", 0, null);

    const stats = registry.stats();
    assert.equal(stats.running, 2);
    assert.equal(stats.finished, 1);
    assert.equal(stats.totalSpawned, 3);
    assert.equal(stats.byLayer.worker, 1); // p3 exited, only p1 running
    assert.equal(stats.byLayer.researcher, 1);
  });

  // ─── CLEANUP ───────────────────────────────────────────────

  it("clears finished sessions", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.markExited("p1", 0, null);
    assert.equal(registry.listFinished().length, 1);

    registry.clearFinished();
    assert.equal(registry.listFinished().length, 0);
  });

  it("resets everything", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.register({ id: "p2", command: "cmd", pid: 2 });
    registry.markExited("p2", 0, null);

    registry.reset();
    assert.equal(registry.listRunning().length, 0);
    assert.equal(registry.listFinished().length, 0);
    assert.equal(registry.stats().totalSpawned, 0);
  });

  // ─── SIGNAL BRIDGE ─────────────────────────────────────────

  it("attaches and detaches signal bridge", () => {
    // Should not throw
    registry.attachSignalBridge();
    registry.attachSignalBridge(); // idempotent

    registry.detachSignalBridge();
    registry.detachSignalBridge(); // idempotent
  });

  // ─── EDGE CASES ────────────────────────────────────────────

  it("ignores output for unknown session", () => {
    // Should not throw
    registry.appendOutput("nonexistent", "stdout", "data");
  });

  it("returns null when marking unknown session as exited", () => {
    const result = registry.markExited("nonexistent", 0, null);
    assert.equal(result, null);
  });

  it("handles onExit callback errors gracefully", () => {
    registry.register({
      id: "p1",
      command: "cmd",
      pid: 1,
      onExit: () => { throw new Error("callback crash"); },
    });
    // Should not throw
    registry.markExited("p1", 0, null);
  });
});
