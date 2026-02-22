import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateMessageTokens,
  estimateMessagesTokens,
  chunkMessagesByTokens,
  shouldCompact,
  compactLocal,
  computeAdaptiveChunkRatio,
  isOversizedForSummary,
  pruneHistory,
  type ConversationMessage,
} from "./compaction-engine.js";
import {
  computeNextRunMs,
  CronEngine,
  type CronScheduleAt,
  type CronScheduleEvery,
  type CronScheduleCron,
} from "./cron-engine.js";
import {
  cosineSimilarity,
  normalizeVector,
} from "./embedding-engine.js";
import {
  detectMimeType,
  mimeFromExtension,
  mimeFromMagicBytes,
  categorizeMedia,
  formatFileSize,
  analyzeFile,
  validateForMessaging,
  fileToDataUrl,
  dataUrlToFile,
  MediaEngine,
} from "./media-engine.js";
import {
  Session,
  MultiSessionManager,
} from "./multi-session.js";
import {
  TelegramActions,
  MessageActionsEngine,
} from "./message-actions.js";

describe("Compaction Engine", () => {
  const makeMsg = (role: "user" | "assistant", text: string): ConversationMessage => ({
    role,
    content: text,
    timestamp: Date.now(),
  });

  it("estimates tokens correctly", () => {
    const tokens = estimateMessageTokens(makeMsg("user", "hello world")); // 11 chars → 3 + 4 overhead
    assert.ok(tokens > 0);
    assert.ok(tokens < 20);
  });

  it("estimates batch tokens", () => {
    const msgs = [makeMsg("user", "a".repeat(100)), makeMsg("assistant", "b".repeat(200))];
    const total = estimateMessagesTokens(msgs);
    assert.ok(total > 50); // at least 75 + 54
  });

  it("chunks messages by token limit", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => makeMsg("user", `Message ${i} ${"x".repeat(100)}`));
    const chunks = chunkMessagesByTokens(msgs, 200);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.length <= 10);
    // All messages accounted for
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    assert.equal(total, 10);
  });

  it("detects when compaction needed", () => {
    const smallConv = [makeMsg("user", "hi"), makeMsg("assistant", "hello")];
    assert.equal(shouldCompact(smallConv), false);

    const bigConv = Array.from({ length: 100 }, (_, i) =>
      makeMsg("user", "x".repeat(5000))
    );
    assert.equal(shouldCompact(bigConv, { maxTokens: 10_000, threshold: 0.7, recentKeepCount: 10, maxSummaryTokens: 2000 }), true);
  });

  it("compacts locally without LLM", () => {
    const msgs = Array.from({ length: 20 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `Message number ${i} with some content here`)
    );

    const result = compactLocal(msgs, { recentKeepCount: 5 });
    assert.ok(result.keptCount <= 6); // 5 recent + 1 summary
    assert.ok(result.summarizedCount > 0);
    assert.equal(result.usedLlm, false);
    assert.ok(result.summary.length > 0);
    assert.ok(result.messages.length < msgs.length);
  });

  it("returns original when below threshold", () => {
    const msgs = [makeMsg("user", "hi"), makeMsg("assistant", "hello")];
    const result = compactLocal(msgs, { recentKeepCount: 10 });
    assert.equal(result.messages.length, 2);
    assert.equal(result.summarizedCount, 0);
  });

  it("computes adaptive chunk ratio", () => {
    const small = [makeMsg("user", "hi")];
    assert.ok(computeAdaptiveChunkRatio(small, 128000) > 0.3);

    const big = [makeMsg("user", "x".repeat(50000))];
    assert.ok(computeAdaptiveChunkRatio(big, 128000) < 0.4);
  });

  it("detects oversized messages", () => {
    const small = makeMsg("user", "hello");
    assert.equal(isOversizedForSummary(small, 128000), false);

    const huge = makeMsg("user", "x".repeat(300000));
    assert.equal(isOversizedForSummary(huge, 128000), true);
  });

  it("prunes history to fit budget", () => {
    const msgs = Array.from({ length: 50 }, (_, i) =>
      makeMsg("user", `Message ${i} ${"x".repeat(200)}`)
    );
    const result = pruneHistory(msgs, 5000);
    assert.ok(result.droppedCount > 0);
    assert.ok(result.messages.length < 50);
    assert.ok(result.keptTokens <= 2500); // maxHistoryShare=0.5
  });
});

describe("Cron Engine", () => {
  it("computes next run for 'at' schedule (future)", () => {
    const schedule: CronScheduleAt = { kind: "at", at: new Date(Date.now() + 60000).toISOString() };
    const next = computeNextRunMs(schedule, Date.now());
    assert.ok(next !== undefined);
    assert.ok(next! > Date.now());
  });

  it("returns undefined for past 'at' schedule", () => {
    const schedule: CronScheduleAt = { kind: "at", at: new Date(Date.now() - 60000).toISOString() };
    const next = computeNextRunMs(schedule, Date.now());
    assert.equal(next, undefined);
  });

  it("computes next run for 'every' schedule", () => {
    const now = Date.now();
    const schedule: CronScheduleEvery = { kind: "every", everyMs: 5000, anchorMs: now - 3000 };
    const next = computeNextRunMs(schedule, now);
    assert.ok(next !== undefined);
    assert.ok(next! > now);
    assert.ok(next! <= now + 5000);
  });

  it("computes next run for cron expression", () => {
    const schedule: CronScheduleCron = { kind: "cron", expr: "* * * * *" }; // every minute
    const next = computeNextRunMs(schedule, Date.now());
    assert.ok(next !== undefined);
    assert.ok(next! > Date.now());
    assert.ok(next! < Date.now() + 120_000); // within 2 minutes
  });

  it("creates and manages jobs", () => {
    const tmpDir = `/tmp/foreman-cron-test-${Date.now()}`;
    const engine = new CronEngine(tmpDir);

    const job = engine.addJob({
      name: "test-job",
      schedule: { kind: "every", everyMs: 60000 },
      payload: { kind: "callback", callbackId: "test" },
    });

    assert.ok(job.id.startsWith("cron_"));
    assert.equal(job.name, "test-job");
    assert.equal(job.enabled, true);

    const listed = engine.listJobs();
    assert.equal(listed.length, 1);

    engine.updateJob(job.id, { enabled: false });
    assert.equal(engine.listJobs().length, 0); // disabled hidden by default
    assert.equal(engine.listJobs(true).length, 1);

    assert.equal(engine.removeJob(job.id), true);
    assert.equal(engine.listJobs(true).length, 0);

    engine.stop();
  });

  it("tracks job statistics", () => {
    const tmpDir = `/tmp/foreman-cron-test2-${Date.now()}`;
    const engine = new CronEngine(tmpDir);

    engine.addJob({
      name: "j1",
      schedule: { kind: "every", everyMs: 10000 },
      payload: { kind: "callback", callbackId: "a" },
    });
    engine.addJob({
      name: "j2",
      schedule: { kind: "every", everyMs: 10000 },
      payload: { kind: "callback", callbackId: "b" },
      enabled: false,
    });

    const stats = engine.stats();
    assert.equal(stats.total, 2);
    assert.equal(stats.enabled, 1);
    assert.equal(stats.totalRuns, 0);

    engine.stop();
  });
});

describe("Embedding Engine", () => {
  it("computes cosine similarity", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1.0) < 0.001);
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0]) - 0.0) < 0.001);
    assert.ok(cosineSimilarity([1, 1, 0], [1, 0, 0]) > 0.5);
    assert.ok(cosineSimilarity([1, 1, 0], [1, 0, 0]) < 1.0);
  });

  it("handles zero vectors", () => {
    assert.equal(cosineSimilarity([0, 0, 0], [1, 0, 0]), 0);
    assert.equal(cosineSimilarity([], []), 0);
  });

  it("normalizes vectors", () => {
    const v = normalizeVector([3, 4]);
    assert.ok(Math.abs(v[0] - 0.6) < 0.001);
    assert.ok(Math.abs(v[1] - 0.8) < 0.001);
    const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    assert.ok(Math.abs(mag - 1.0) < 0.001);
  });

  it("handles zero vector normalization", () => {
    const v = normalizeVector([0, 0, 0]);
    assert.deepEqual(v, [0, 0, 0]);
  });
});

describe("Media Engine", () => {
  it("detects MIME from extension", () => {
    assert.equal(mimeFromExtension("photo.jpg"), "image/jpeg");
    assert.equal(mimeFromExtension("script.ts"), "text/typescript");
    assert.equal(mimeFromExtension("data.json"), "application/json");
    assert.equal(mimeFromExtension("unknown.xyz"), "application/octet-stream");
  });

  it("detects MIME from magic bytes", () => {
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    assert.equal(mimeFromMagicBytes(jpegHeader), "image/jpeg");

    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
    assert.equal(mimeFromMagicBytes(pngHeader), "image/png");

    const unknown = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    assert.equal(mimeFromMagicBytes(unknown), null);
  });

  it("categorizes MIME types", () => {
    assert.equal(categorizeMedia("image/jpeg"), "image");
    assert.equal(categorizeMedia("audio/mpeg"), "audio");
    assert.equal(categorizeMedia("video/mp4"), "video");
    assert.equal(categorizeMedia("text/typescript"), "code");
    assert.equal(categorizeMedia("application/json"), "data");
    assert.equal(categorizeMedia("application/pdf"), "document");
    assert.equal(categorizeMedia("application/octet-stream"), "unknown");
  });

  it("formats file sizes", () => {
    assert.equal(formatFileSize(500), "500B");
    assert.equal(formatFileSize(1500), "1.5KB");
    assert.equal(formatFileSize(1500000), "1.4MB");
    assert.equal(formatFileSize(1500000000), "1.4GB");
  });

  it("analyzes existing file", () => {
    const result = analyzeFile("package.json");
    assert.ok(result !== null);
    assert.equal(result!.mimeType, "application/json");
    assert.equal(result!.category, "data");
    assert.ok(result!.size > 0);
    assert.ok(result!.hash.length > 0);
  });

  it("handles nonexistent file", () => {
    assert.equal(analyzeFile("/nonexistent/file.txt"), null);
  });

  it("validates files for messaging", () => {
    // This file exists and is small
    const result = validateForMessaging("package.json", "telegram");
    assert.equal(result.valid, true);
  });

  it("base64 round-trip", async () => {
    const fs = await import("node:fs");
    const tmpFile = `/tmp/foreman-b64-test-${Date.now()}.txt`;
    fs.writeFileSync(tmpFile, "Hello, World!");

    const dataUrl = fileToDataUrl(tmpFile);
    assert.ok(dataUrl !== null);
    assert.ok(dataUrl!.startsWith("data:text/plain;base64,"));

    const outFile = `/tmp/foreman-b64-out-${Date.now()}.txt`;
    assert.ok(dataUrlToFile(dataUrl!, outFile));

    assert.equal(fs.readFileSync(outFile, "utf-8"), "Hello, World!");

    fs.unlinkSync(tmpFile);
    fs.unlinkSync(outFile);
  });

  it("MediaEngine class works", () => {
    const tmpDir = `/tmp/foreman-media-test-${Date.now()}`;
    const engine = new MediaEngine(tmpDir);
    assert.equal(engine.detectMime("test.png"), "image/png");
    assert.ok(engine.getDownloadDir().includes("media"));
  });
});

describe("Multi-Session Engine", () => {
  it("creates sessions", () => {
    const tmpDir = `/tmp/foreman-session-test-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir);

    const session = manager.createSession({ label: "test-session", task: "Test task" });
    assert.ok(session.id.startsWith("session_"));
    assert.equal(session.label, "test-session");
    assert.equal(session.status, "idle");
    assert.equal(session.task, "Test task");

    manager.stop();
  });

  it("lists sessions with filters", () => {
    const tmpDir = `/tmp/foreman-session-test2-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir);

    const s1 = manager.createSession({ label: "running-1" });
    s1.status = "running";

    const s2 = manager.createSession({ label: "idle-1" });

    const all = manager.listSessions();
    assert.equal(all.length, 2);

    const running = manager.listSessions({ status: "running" });
    assert.equal(running.length, 1);
    assert.equal(running[0].label, "running-1");

    manager.stop();
  });

  it("spawns sub-agents", () => {
    const tmpDir = `/tmp/foreman-session-test3-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir);

    const parent = manager.createSession({ label: "parent" });
    const child = manager.spawnSubAgent({
      parentSessionId: parent.id,
      task: "Sub-task",
      label: "child-1",
    });

    assert.ok(child !== null);
    assert.equal(child!.parentId, parent.id);
    assert.equal(child!.status, "running");
    assert.equal(child!.task, "Sub-task");

    const subs = manager.getSubAgents(parent.id);
    assert.equal(subs.length, 1);

    manager.stop();
  });

  it("handles messages", () => {
    const tmpDir = `/tmp/foreman-session-test4-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir);

    const session = manager.createSession({ label: "chat" });
    const msg = manager.sendMessage(session.id, "user", "Hello!");

    assert.ok(msg !== null);
    assert.equal(msg!.role, "user");
    assert.equal(msg!.content, "Hello!");

    const history = manager.getHistory(session.id);
    assert.equal(history.length, 1);

    manager.stop();
  });

  it("terminates sessions", () => {
    const tmpDir = `/tmp/foreman-session-test5-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir);

    const session = manager.createSession({ label: "to-kill" });
    assert.equal(manager.terminateSession(session.id), true);

    const info = manager.getSession(session.id)!.getInfo();
    assert.equal(info.status, "terminated");

    manager.stop();
  });

  it("respects concurrency limits", () => {
    const tmpDir = `/tmp/foreman-session-test6-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir, { maxConcurrent: 2 });

    const parent = manager.createSession({ label: "parent" });

    const c1 = manager.spawnSubAgent({ parentSessionId: parent.id, task: "t1" });
    const c2 = manager.spawnSubAgent({ parentSessionId: parent.id, task: "t2" });
    const c3 = manager.spawnSubAgent({ parentSessionId: parent.id, task: "t3" });

    assert.ok(c1 !== null);
    assert.ok(c2 !== null);
    assert.equal(c3, null); // blocked by limit

    manager.stop();
  });

  it("stats are accurate", () => {
    const tmpDir = `/tmp/foreman-session-test7-${Date.now()}`;
    const manager = new MultiSessionManager(tmpDir);

    const s1 = manager.createSession({ label: "s1" });
    s1.status = "running";
    const s2 = manager.createSession({ label: "s2" });
    manager.completeSession(s2.id);

    const stats = manager.stats();
    assert.equal(stats.total, 2);
    assert.equal(stats.running, 1);
    assert.equal(stats.completed, 1);

    manager.stop();
  });
});

describe("Message Actions Engine", () => {
  it("creates TelegramActions with token", () => {
    const actions = new TelegramActions("test-token");
    assert.ok(actions !== null);
  });

  it("MessageActionsEngine initializes", () => {
    const engine = new MessageActionsEngine();
    assert.equal(engine.getTelegramActions(), null);

    engine.setTelegramToken("test-token");
    assert.ok(engine.getTelegramActions() !== null);
  });

  it("returns error when no provider", async () => {
    const engine = new MessageActionsEngine();
    const result = await engine.react("123", "456", "👍");
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("configured"));
  });
});
