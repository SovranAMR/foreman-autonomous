/**
 * FOREMAN — Enhanced Exec Lifecycle Tests
 *
 * Tests for:
 * - Graceful shutdown (SIGTERM → wait → SIGKILL)
 * - Background exec (yieldMs pattern)
 * - Process lifecycle (list/poll/log/kill)
 * - Unhandled rejection protection
 * - sliceLogLines utility
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProcessRegistry, createSessionId, sliceLogLines } from "./process-registry.js";
import {
  isAbortError,
  isFatalError,
  isTransientNetworkError,
  registerUnhandledRejectionHandler,
} from "./unhandled-rejections.js";

// ─── sliceLogLines ───────────────────────────────────────────

describe("sliceLogLines", () => {
  const sampleLog = "line1\nline2\nline3\nline4\nline5\n";

  it("returns full text when no offset/limit", () => {
    const result = sliceLogLines(sampleLog);
    assert.equal(result.totalLines, 5);
    assert.equal(result.totalChars, sampleLog.length);
    assert.ok(result.slice.includes("line1"));
    assert.ok(result.slice.includes("line5"));
  });

  it("slices from offset", () => {
    const result = sliceLogLines(sampleLog, 2);
    assert.ok(result.slice.startsWith("line3"));
  });

  it("limits number of lines", () => {
    const result = sliceLogLines(sampleLog, 0, 2);
    const lines = result.slice.split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "line1");
    assert.equal(lines[1], "line2");
  });

  it("tail mode: limit without offset returns last N lines", () => {
    const result = sliceLogLines(sampleLog, undefined, 2);
    const lines = result.slice.split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "line4");
    assert.equal(lines[1], "line5");
  });

  it("handles empty text", () => {
    const result = sliceLogLines("");
    assert.equal(result.totalLines, 0);
    assert.equal(result.totalChars, 0);
    assert.equal(result.slice, "");
  });

  it("handles CRLF normalization", () => {
    const result = sliceLogLines("line1\r\nline2\r\n");
    assert.equal(result.totalLines, 2);
  });
});

// ─── ProcessRegistry: Graceful Shutdown ──────────────────────

describe("ProcessRegistry graceful shutdown", () => {
  let registry: ProcessRegistry;

  beforeEach(() => {
    registry = new ProcessRegistry({ ttlMs: 60_000 });
  });

  it("kill with SIGKILL skips grace period", () => {
    const session = registry.register({
      id: "p_kill_1",
      command: "sleep 100",
      pid: 999999, // fake pid — won't actually kill
    });

    // Direct SIGKILL should mark as killed immediately
    const result = registry.kill("p_kill_1", "SIGKILL");
    assert.ok(result);

    // Should be in finished state
    const finished = registry.getFinished("p_kill_1");
    assert.ok(finished);
    assert.equal(finished!.status, "killed");
    assert.equal(finished!.exitSignal, "SIGKILL");
  });

  it("returns false for unknown session", () => {
    const result = registry.kill("nonexistent");
    assert.equal(result, false);
  });

  it("returns false for session without pid", () => {
    registry.register({ id: "p_nopid", command: "echo hi" });
    const result = registry.kill("p_nopid");
    assert.equal(result, false);
  });

  it("killAll sends signal to all running sessions", () => {
    registry.register({ id: "p1", command: "cmd1", pid: 999901 });
    registry.register({ id: "p2", command: "cmd2", pid: 999902 });
    registry.register({ id: "p3", command: "cmd3", pid: 999903 });

    // Use SIGKILL directly to avoid async escalation timer
    const killed = registry.killAll("SIGKILL", 0);
    assert.equal(killed, 3);
    assert.equal(registry.listRunning().length, 0);
  });
});

// ─── ProcessRegistry: getLog ─────────────────────────────────

describe("ProcessRegistry getLog", () => {
  let registry: ProcessRegistry;

  beforeEach(() => {
    registry = new ProcessRegistry({ ttlMs: 60_000 });
  });

  it("returns log for running session", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.appendOutput("p1", "stdout", "line1\nline2\nline3\n");

    const log = registry.getLog("p1");
    assert.ok(log);
    assert.equal(log!.totalLines, 3);
    assert.equal(log!.status, "running");
    assert.ok(log!.text.includes("line1"));
  });

  it("returns log for finished session", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.appendOutput("p1", "stdout", "output data\n");
    registry.markExited("p1", 0, null);

    const log = registry.getLog("p1");
    assert.ok(log);
    assert.equal(log!.status, "completed");
    assert.ok(log!.text.includes("output data"));
  });

  it("supports offset and limit", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.appendOutput("p1", "stdout", "a\nb\nc\nd\ne\n");

    const log = registry.getLog("p1", { offset: 1, limit: 2 });
    assert.ok(log);
    const lines = log!.text.split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "b");
    assert.equal(lines[1], "c");
  });

  it("returns null for unknown session", () => {
    const log = registry.getLog("nonexistent");
    assert.equal(log, null);
  });
});

// ─── ProcessRegistry: deleteFinished ─────────────────────────

describe("ProcessRegistry deleteFinished", () => {
  let registry: ProcessRegistry;

  beforeEach(() => {
    registry = new ProcessRegistry({ ttlMs: 60_000 });
  });

  it("deletes a finished session", () => {
    registry.register({ id: "p1", command: "cmd", pid: 1 });
    registry.markExited("p1", 0, null);

    assert.ok(registry.getFinished("p1"));
    const deleted = registry.deleteFinished("p1");
    assert.ok(deleted);
    assert.equal(registry.getFinished("p1"), null);
  });

  it("returns false for non-existent session", () => {
    const deleted = registry.deleteFinished("nonexistent");
    assert.equal(deleted, false);
  });
});

// ─── ProcessRegistry: Background marking ────────────────────

describe("ProcessRegistry background", () => {
  let registry: ProcessRegistry;

  beforeEach(() => {
    registry = new ProcessRegistry({ ttlMs: 60_000 });
  });

  it("marks and queries backgrounded state", () => {
    registry.register({ id: "p1", command: "npm run build", pid: 1 });
    assert.equal(registry.get("p1")!.backgrounded, false);

    registry.background("p1");
    assert.equal(registry.get("p1")!.backgrounded, true);
  });

  it("background on non-existent session is safe", () => {
    // Should not throw
    registry.background("nonexistent");
  });
});

// ─── Unhandled Rejection Protection ──────────────────────────

describe("Unhandled rejection classification", () => {
  it("detects AbortError by name", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    assert.ok(isAbortError(err));
  });

  it("detects AbortError by message", () => {
    const err = new Error("This operation was aborted");
    assert.ok(isAbortError(err));
  });

  it("rejects non-abort errors", () => {
    assert.ok(!isAbortError(new Error("something else")));
    assert.ok(!isAbortError(null));
    assert.ok(!isAbortError(undefined));
  });

  it("detects fatal errors", () => {
    const err = new Error("out of memory");
    (err as any).code = "ERR_OUT_OF_MEMORY";
    assert.ok(isFatalError(err));
  });

  it("detects fatal errors in cause chain", () => {
    const cause = new Error("oom");
    (cause as any).code = "ERR_SCRIPT_EXECUTION_TIMEOUT";
    const err = new Error("wrapper", { cause });
    assert.ok(isFatalError(err));
  });

  it("rejects non-fatal errors", () => {
    assert.ok(!isFatalError(new Error("normal error")));
    assert.ok(!isFatalError(null));
  });

  it("detects transient network errors", () => {
    const err = new Error("connection reset");
    (err as any).code = "ECONNRESET";
    assert.ok(isTransientNetworkError(err));
  });

  it("detects undici fetch failed as transient", () => {
    const err = new TypeError("fetch failed");
    assert.ok(isTransientNetworkError(err));
  });

  it("detects transient errors in cause chain", () => {
    const cause = new Error("dns");
    (cause as any).code = "ENOTFOUND";
    const err = new TypeError("fetch failed");
    (err as any).cause = cause;
    assert.ok(isTransientNetworkError(err));
  });

  it("rejects non-transient errors", () => {
    assert.ok(!isTransientNetworkError(new Error("not network")));
    assert.ok(!isTransientNetworkError(null));
    assert.ok(!isTransientNetworkError(undefined));
  });
});

describe("Custom unhandled rejection handlers", () => {
  it("registers and unregisters handlers", () => {
    let handled = false;
    const cleanup = registerUnhandledRejectionHandler(() => {
      handled = true;
      return true;
    });

    // Handler is registered — cleanup function returned
    assert.ok(typeof cleanup === "function");

    // Unregister
    cleanup();
    // Should not throw
    cleanup(); // idempotent
  });
});

// ─── ProcessRegistry: Graceful kill with gracePeriodMs ───────

describe("ProcessRegistry gracePeriodMs", () => {
  let registry: ProcessRegistry;

  beforeEach(() => {
    registry = new ProcessRegistry({ ttlMs: 60_000 });
  });

  it("kill with gracePeriodMs=0 marks as killed immediately", () => {
    registry.register({ id: "p1", command: "sleep 10", pid: 999988 });
    const result = registry.kill("p1", "SIGTERM", 0);
    assert.ok(result);

    const finished = registry.getFinished("p1");
    assert.ok(finished);
    assert.equal(finished!.status, "killed");
  });
});

// ─── createSessionId ─────────────────────────────────────────

describe("createSessionId", () => {
  it("generates unique prefixed IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createSessionId());
    }
    assert.equal(ids.size, 100);
    for (const id of ids) {
      assert.ok(id.startsWith("proc_"));
    }
  });
});
