import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Identity Engine ─────────────────────────────────────────

import { IdentityEngine } from "./identity-engine.js";

describe("Identity Engine", () => {
  it("loads identity from IDENTITY.md", () => {
    const dir = join(tmpdir(), `foreman-id-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "IDENTITY.md"), [
      "# IDENTITY.md - Who Am I?",
      "",
      "- **Name:** Sov",
      "- **Emoji:** ⚔️",
      "- **Vibe:** Sharp. Quiet confidence.",
      "",
      "## What I Stand For",
      "- Sovereignty over dependence",
      "- Signal over noise",
    ].join("\n"));

    const engine = new IdentityEngine(dir);
    const ctx = engine.getContext();
    assert.ok(ctx.identity);
    assert.equal(ctx.identity.name, "Sov");
    assert.equal(ctx.identity.emoji, "⚔️");
    assert.ok(ctx.identity.values.length >= 2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads SOUL.md", () => {
    const dir = join(tmpdir(), `foreman-soul-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SOUL.md"), [
      "# SOUL.md",
      "",
      "## Core Truths",
      "",
      "Be genuinely helpful.",
      "",
      "Have opinions.",
      "",
      "## Boundaries",
      "- Private things stay private",
      "- When in doubt, ask",
    ].join("\n"));

    const engine = new IdentityEngine(dir);
    const ctx = engine.getContext();
    assert.ok(ctx.soul);
    assert.ok(ctx.soul.coreTruths.length >= 2);
    assert.ok(ctx.soul.boundaries.length >= 2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads USER.md", () => {
    const dir = join(tmpdir(), `foreman-user-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "USER.md"), [
      "# USER.md — Ali İlçel",
      "",
      "## Temel",
      "- **İsim:** Ali İlçel",
      "- **Timezone:** Europe/Istanbul",
      "",
      "## Ne Mutlu Ediyor",
      "- İşin düzgün yapılması",
      "- Kısa, keskin cevaplar",
      "",
      "## Kırmızı Çizgiler",
      "1. ❌ Demo/Mock kullanma",
      "2. ❌ Yarım iş bırakma",
    ].join("\n"));

    const engine = new IdentityEngine(dir);
    const ctx = engine.getContext();
    assert.ok(ctx.user);
    assert.equal(ctx.user.name, "Ali İlçel");
    assert.ok(ctx.user.preferences.length >= 2);
    assert.ok(ctx.user.redLines.length >= 2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds context injection", () => {
    const dir = join(tmpdir(), `foreman-inject-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "IDENTITY.md"), "- **Name:** TestBot");
    writeFileSync(join(dir, "USER.md"), "- **İsim:** TestUser");

    const engine = new IdentityEngine(dir);
    const injection = engine.buildContextInjection();
    assert.ok(injection.includes("Agent Identity"));
    assert.ok(injection.includes("User Profile"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("updates and searches memory", () => {
    const dir = join(tmpdir(), `foreman-mem-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const engine = new IdentityEngine(dir);
    engine.updateMemory("favorite_color", "blue", "Preferences");
    engine.updateMemory("project_name", "Foreman", "Project");

    assert.equal(engine.getMemory("favorite_color"), "blue");
    const results = engine.searchMemory("blue");
    assert.ok(results.length > 0);

    // Check persisted
    assert.ok(existsSync(join(dir, "MEMORY.md")));
    const content = readFileSync(join(dir, "MEMORY.md"), "utf-8");
    assert.ok(content.includes("favorite_color"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("hot-reloads on file change", () => {
    const dir = join(tmpdir(), `foreman-reload-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "IDENTITY.md"), "- **Name:** OldName");

    const engine = new IdentityEngine(dir);
    assert.equal(engine.getAgentName(), "OldName");

    // Simulate file change (write new content with future mtime)
    writeFileSync(join(dir, "IDENTITY.md"), "- **Name:** NewName");
    // Force reload by touching cache
    engine.reload();
    assert.equal(engine.getAgentName(), "NewName");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── Browser Engine ──────────────────────────────────────────

import { BrowserEngine } from "./browser-engine.js";

describe("Browser Engine", () => {
  it("creates instance", () => {
    const engine = new BrowserEngine(tmpdir());
    assert.ok(engine);
  });

  it("checks availability", () => {
    const engine = new BrowserEngine(tmpdir());
    const available = engine.checkAvailability();
    assert.equal(typeof available, "boolean");
  });

  it("checks server health", async () => {
    const engine = new BrowserEngine(tmpdir());
    // Check a known URL
    const result = await engine.checkServer("https://example.com");
    assert.equal(typeof result.running, "boolean");
    if (result.running) {
      assert.ok(result.status! >= 200);
      assert.ok(result.responseTime! > 0);
    }
  });
});

// ─── Sub-Agent Engine ────────────────────────────────────────

import { SubAgentEngine, createFullStackTeam, createResearchBuildTeam } from "./subagent-engine.js";

describe("Sub-Agent Engine", () => {
  it("spawns a sub-agent", async () => {
    const engine = new SubAgentEngine();
    const agent = await engine.spawn({ task: "Write unit tests" });
    assert.ok(agent.id.startsWith("sa_"));
    assert.equal(agent.task, "Write unit tests");
    assert.ok(["pending", "running", "completed"].includes(agent.status));
  });

  it("tracks agent status", async () => {
    const engine = new SubAgentEngine();
    await engine.spawn({ task: "Task 1" });
    await engine.spawn({ task: "Task 2" });

    const status = engine.getStatus();
    assert.equal(status.total, 2);
  });

  it("lists agents with filters", async () => {
    const engine = new SubAgentEngine();
    await engine.spawn({ task: "Frontend", role: "frontend" });
    await engine.spawn({ task: "Backend", role: "backend" });

    const frontend = engine.list({ role: "frontend" });
    assert.equal(frontend.length, 1);
    assert.equal(frontend[0].role, "frontend");
  });

  it("sends messages between agents", async () => {
    const engine = new SubAgentEngine();
    const a = await engine.spawn({ task: "Agent A" });
    const b = await engine.spawn({ task: "Agent B" });

    const sent = engine.sendMessage(a.id, b.id, "Hello from A");
    assert.ok(sent);
    assert.equal(b.messages.length, 1);
    assert.equal(b.messages[0].content, "Hello from A");
  });

  it("kills agents", async () => {
    const engine = new SubAgentEngine({ maxConcurrent: 1 });
    const agent = await engine.spawn({ task: "Long task", timeoutMs: 60000 });

    // Wait a tick for status to become "running"
    await new Promise(r => setTimeout(r, 10));

    if (agent.status === "running") {
      const killed = engine.kill(agent.id);
      assert.ok(killed);
      assert.equal(agent.status, "killed");
    }
  });

  it("aggregates results", async () => {
    const engine = new SubAgentEngine();
    const a = await engine.spawn({ task: "Task 1" });
    const b = await engine.spawn({ task: "Task 2" });

    // Wait for completion
    await new Promise(r => setTimeout(r, 50));

    const agg = engine.aggregateResults([a.id, b.id]);
    assert.equal(agg.totalAgents, 2);
  });

  it("creates fullstack team plan", () => {
    const plan = createFullStackTeam("Build a website");
    assert.equal(plan.strategy, "parallel");
    assert.equal(plan.agents.length, 3);
    assert.ok(plan.agents.some(a => a.role === "frontend"));
    assert.ok(plan.agents.some(a => a.role === "backend"));
  });

  it("creates research-build team plan", () => {
    const plan = createResearchBuildTeam("Build an API");
    assert.equal(plan.strategy, "pipeline");
    assert.equal(plan.agents.length, 3);
  });

  it("cleans up completed agents", async () => {
    const engine = new SubAgentEngine();
    await engine.spawn({ task: "Task" });
    await new Promise(r => setTimeout(r, 50));

    engine.cleanup();
    const remaining = engine.list({ status: "running" });
    assert.ok(remaining.length === 0);
  });
});

// ─── Session Lifecycle ───────────────────────────────────────

import { SessionLifecycle } from "./session-lifecycle.js";

describe("Session Lifecycle Engine", () => {
  it("creates sessions with slugs", () => {
    const dir = join(tmpdir(), `foreman-sess-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    const session = engine.create({ task: "Build website" });
    assert.ok(session.id);
    assert.ok(session.slug.includes("-")); // e.g., "swift-arc"
    assert.equal(session.status, "active");
    assert.equal(session.context.task, "Build website");

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists and filters sessions", () => {
    const dir = join(tmpdir(), `foreman-sesslist-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    engine.create({ task: "Task 1" });
    engine.create({ task: "Task 2" });
    const s3 = engine.create({ task: "Task 3" });
    engine.transition(s3.id, "idle");

    const active = engine.list({ status: "active" });
    assert.equal(active.length, 2);
    const idle = engine.list({ status: "idle" });
    assert.equal(idle.length, 1);

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("forks sessions", () => {
    const dir = join(tmpdir(), `foreman-fork-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    const parent = engine.create({ task: "Original task" });
    const child = engine.fork(parent.id, { task: "Try different approach" });

    assert.ok(child);
    assert.equal(child!.parentId, parent.id);
    assert.equal(child!.context.task, "Try different approach");

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("manages session memory", () => {
    const dir = join(tmpdir(), `foreman-sessmem-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    const session = engine.create();
    engine.setMemory(session.id, "api_key", "test-key");

    const s = engine.get(session.id);
    assert.equal(s!.context.memory.api_key, "test-key");

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates teams", () => {
    const dir = join(tmpdir(), `foreman-team-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    const team = engine.createTeam("fullstack", "parallel");
    const s1 = engine.create({ teamId: team.id, task: "Frontend" });
    const s2 = engine.create({ teamId: team.id, task: "Backend" });
    engine.addToTeam(team.id, s1.id);
    engine.addToTeam(team.id, s2.id);

    assert.equal(team.sessionIds.length, 2);

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("searches sessions", () => {
    const dir = join(tmpdir(), `foreman-search-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    engine.create({ task: "Build React dashboard" });
    engine.create({ task: "Fix Python API" });

    const results = engine.search("react");
    assert.equal(results.length, 1);

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("tracks stats", () => {
    const dir = join(tmpdir(), `foreman-stats-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const engine = new SessionLifecycle(dir);

    engine.create();
    engine.create();

    const stats = engine.getStats();
    assert.equal(stats.total, 2);
    assert.equal(stats.active, 2);

    engine.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists and loads sessions", () => {
    const dir = join(tmpdir(), `foreman-persist-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const engine1 = new SessionLifecycle(dir);
    const session = engine1.create({ slug: "test-session", task: "Persistent task" });
    engine1.shutdown();

    // Load in new instance
    const engine2 = new SessionLifecycle(dir);
    const loaded = engine2.get("test-session");
    assert.ok(loaded);
    assert.equal(loaded!.context.task, "Persistent task");

    engine2.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── Forge Gateway Bridge ────────────────────────────────────

import { ForgeGatewayBridge } from "./forge-gateway.js";

describe("Forge Gateway Bridge", () => {
  it("handles /cost command", () => {
    // Create minimal mock engine
    const mockEngine = {
      costTracker: { formatReport: () => "Total: $0.00" },
      projectInfo: { name: "test" },
      rollback: { rollbackLastAtom: () => null },
      identity: { getContext: () => ({ identity: { name: "Test", vibe: "Cool" }, user: { name: "Ali" } }) },
      subAgents: { getStatus: () => ({ total: 0, running: 0, completed: 0, failed: 0, pending: 0, killed: 0 }) },
      sessionLifecycle: { getStats: () => ({ total: 0, active: 0, idle: 0, expired: 0, archived: 0, totalTokens: 0, totalMessages: 0, teams: 0 }) },
    } as any;

    const bridge = new ForgeGatewayBridge(mockEngine);
    const sender = { send: async () => {}, editLast: async () => {} };

    const costResult = bridge.handleCommand("/cost", "test-chat", sender);
    assert.ok(costResult?.includes("$"));

    const identityResult = bridge.handleCommand("/identity", "test-chat", sender);
    assert.ok(identityResult?.includes("Test"));

    const agentsResult = bridge.handleCommand("/agents", "test-chat", sender);
    assert.ok(agentsResult?.includes("Sub-Agents"));

    const sessionsResult = bridge.handleCommand("/sessions", "test-chat", sender);
    assert.ok(sessionsResult?.includes("Sessions"));

    const rollbackResult = bridge.handleCommand("/rollback", "test-chat", sender);
    assert.ok(rollbackResult?.includes("Rollback"));
  });

  it("returns null for unknown commands", () => {
    const mockEngine = {} as any;
    const bridge = new ForgeGatewayBridge(mockEngine);
    const sender = { send: async () => {}, editLast: async () => {} };

    const result = bridge.handleCommand("/unknown", "test-chat", sender);
    assert.equal(result, null);
  });
});
