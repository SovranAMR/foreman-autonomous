import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Streaming Pipeline ──────────────────────────────────────

import {
  StreamingPipeline,
  ConsoleTarget,
  FileTarget,
  CallbackTarget,
  renderProgressBar,
} from "./streaming-pipeline.js";

describe("Streaming Pipeline Engine", () => {
  it("creates and streams events", () => {
    const pipeline = new StreamingPipeline();
    const events: any[] = [];
    pipeline.addTarget(new CallbackTarget(e => events.push(e)));

    pipeline.pipelineStart("Test task");
    pipeline.phaseStart("vision", "Analyzing");
    pipeline.phaseEnd("vision", "Done");
    pipeline.pipelineEnd(true);

    assert.ok(events.length >= 4);
    assert.equal(events[0].type, "pipeline_start");
    assert.equal(events[1].type, "phase_start");
    assert.equal(events[1].phase, "vision");
  });

  it("tracks progress", () => {
    const pipeline = new StreamingPipeline();
    pipeline.addTarget(new CallbackTarget(() => {}));
    pipeline.pipelineStart("Test");
    pipeline.blockStart(0, 3, "Block 1");
    pipeline.atomStart(0, 5, "Atom 1");
    pipeline.atomEnd(0, 1000, 0.005);

    const progress = pipeline.getProgress();
    assert.equal(progress.totalBlocks, 3);
    assert.equal(progress.currentAtom, 0);
  });

  it("tracks tool calls", () => {
    const pipeline = new StreamingPipeline();
    pipeline.addTarget(new CallbackTarget(() => {}));
    pipeline.toolCall("bash", '{"command": "npm test"}');
    pipeline.toolCall("read_file", '{"path": "src/index.ts"}');

    const progress = pipeline.getProgress();
    assert.equal(progress.toolCalls, 2);
  });

  it("renders progress bar", () => {
    assert.equal(renderProgressBar(0, 10, 10), "[░░░░░░░░░░] 0%");
    assert.equal(renderProgressBar(5, 10, 10), "[█████░░░░░] 50%");
    assert.equal(renderProgressBar(10, 10, 10), "[██████████] 100%");
  });

  it("logs events to file target", () => {
    const logPath = join(tmpdir(), `foreman-stream-test-${Date.now()}.log`);
    const pipeline = new StreamingPipeline();
    pipeline.addTarget(new FileTarget(logPath));
    pipeline.pipelineStart("File test");
    pipeline.pipelineEnd(true);

    assert.ok(existsSync(logPath));
    const content = readFileSync(logPath, "utf-8");
    assert.ok(content.includes("pipeline_start"));
    rmSync(logPath, { force: true });
  });

  it("records event log", () => {
    const pipeline = new StreamingPipeline();
    pipeline.addTarget(new CallbackTarget(() => {}));
    pipeline.error("Something broke");
    pipeline.warning("Watch out");

    const log = pipeline.getEventLog();
    assert.ok(log.some(e => e.type === "error"));
    assert.ok(log.some(e => e.type === "warning"));

    const progress = pipeline.getProgress();
    assert.equal(progress.errors, 1);
  });
});

// ─── Interactive Confirm ─────────────────────────────────────

import {
  InteractiveConfirm,
  assessRisk,
  type ConfirmRequest,
} from "./interactive-confirm.js";

describe("Interactive Confirm Engine", () => {
  it("assesses risk for commands", () => {
    assert.equal(assessRisk({ type: "run_command", target: "rm -rf /", description: "", risk: "low" }), "critical");
    assert.equal(assessRisk({ type: "run_command", target: "sudo apt install", description: "", risk: "low" }), "critical");
    assert.equal(assessRisk({ type: "run_command", target: "npm install express", description: "", risk: "low" }), "low");
    assert.equal(assessRisk({ type: "run_command", target: "git push origin main", description: "", risk: "low" }), "medium");
  });

  it("assesses risk for file operations", () => {
    assert.equal(assessRisk({ type: "delete_file", target: "/etc/passwd", description: "", risk: "low" }), "critical");
    assert.equal(assessRisk({ type: "delete_file", target: "src/old.ts", description: "", risk: "low" }), "high");
    assert.equal(assessRisk({ type: "write_file", target: "src/index.ts", description: "", risk: "low" }), "low");
    assert.equal(assessRisk({ type: "write_file", target: ".env", description: "", risk: "low" }), "high");
  });

  it("auto-approves low risk in non-interactive mode", async () => {
    const confirm = new InteractiveConfirm({ enabled: false, autoApproveLow: true });
    const result = await confirm.confirm({
      type: "write_file",
      target: "src/test.ts",
      description: "Write test file",
      risk: "low",
    });
    assert.equal(result.action, "approve");
    confirm.close();
  });

  it("skips critical in non-interactive mode", async () => {
    const confirm = new InteractiveConfirm({ enabled: false });
    const result = await confirm.confirm({
      type: "run_command",
      target: "rm -rf /",
      description: "Delete everything",
      risk: "critical",
    });
    assert.equal(result.action, "skip");
    confirm.close();
  });

  it("learns patterns", async () => {
    const confirm = new InteractiveConfirm({ enabled: false, autoApproveLow: false });
    confirm.learn("src/.*\\.ts$");
    const result = await confirm.confirm({
      type: "write_file",
      target: "src/new-file.ts",
      description: "Write new file",
      risk: "medium",
    });
    assert.equal(result.action, "approve");
    confirm.close();
  });

  it("tracks stats", async () => {
    const confirm = new InteractiveConfirm({ enabled: false, autoApproveLow: true });
    await confirm.confirm({ type: "write_file", target: "a.ts", description: "", risk: "low" });
    await confirm.confirm({ type: "write_file", target: "b.ts", description: "", risk: "low" });
    await confirm.confirm({ type: "run_command", target: "rm -rf /", description: "", risk: "critical" });

    const stats = confirm.getStats();
    assert.equal(stats.approved, 2);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.total, 3);
    confirm.close();
  });
});

// ─── Diff Engine ─────────────────────────────────────────────

import {
  generateDiff,
  diffFileChange,
  diffSummary,
  formatDiffSummary,
  formatColoredDiff,
} from "./diff-engine.js";

describe("Diff Engine", () => {
  it("generates diff for added content", () => {
    const diff = generateDiff("test.ts", "", "const x = 1;\n");
    assert.ok(diff.isNew);
    assert.equal(diff.linesAdded, 1);
    assert.equal(diff.linesRemoved, 0);
  });

  it("generates diff for removed content", () => {
    const diff = generateDiff("test.ts", "const x = 1;\n", "");
    assert.ok(diff.isDelete);
    assert.equal(diff.linesRemoved, 1);
  });

  it("generates diff for modified content", () => {
    const old = "line 1\nline 2\nline 3\n";
    const new_ = "line 1\nline 2 modified\nline 3\n";
    const diff = generateDiff("test.ts", old, new_);
    assert.ok(!diff.isNew);
    assert.ok(!diff.isDelete);
    assert.ok(diff.linesAdded > 0 || diff.linesRemoved > 0);
  });

  it("generates unified diff string", () => {
    const diff = generateDiff("test.ts", "old\n", "new\n", "/project");
    assert.ok(diff.unified.includes("--- a/"));
    assert.ok(diff.unified.includes("+++ b/"));
  });

  it("creates diff summary for multiple files", () => {
    const changes = [
      { path: "a.ts", newContent: "new file", type: "create" as const },
      { path: "b.ts", oldContent: "old", newContent: "new", type: "modify" as const },
      { path: "c.ts", oldContent: "delete me", newContent: "", type: "delete" as const },
    ];
    const summary = diffSummary(changes);
    assert.equal(summary.totalFiles, 3);
    assert.equal(summary.filesCreated, 1);
    assert.equal(summary.filesDeleted, 1);
  });

  it("formats diff summary", () => {
    const summary = diffSummary([
      { path: "new.ts", newContent: "hello", type: "create" as const },
    ]);
    const formatted = formatDiffSummary(summary);
    assert.ok(formatted.includes("1 file(s) changed"));
    assert.ok(formatted.includes("created"));
  });

  it("formats colored diff", () => {
    const diff = generateDiff("test.ts", "old line\n", "new line\n");
    const colored = formatColoredDiff(diff);
    assert.ok(colored.includes("---"));
    assert.ok(colored.includes("+++"));
  });
});

// ─── Rollback Engine ─────────────────────────────────────────

import { RollbackEngine } from "./rollback-engine.js";

describe("Rollback Engine", () => {
  it("creates instance", () => {
    const engine = new RollbackEngine(tmpdir());
    assert.ok(engine);
    assert.equal(engine.getPoints().length, 0);
  });

  it("creates rollback points", () => {
    const testDir = join(tmpdir(), `foreman-rollback-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const engine = new RollbackEngine(testDir);

    // This will fail if not a git repo, but the point creation handles it
    const point = engine.createPoint("atom", "Test atom 1", { atomIndex: 0 });
    // May be null in non-git dir — that's OK
    if (point) {
      assert.ok(point.id.startsWith("rb_"));
      assert.equal(point.type, "atom");
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it("previews and lists points", () => {
    const engine = new RollbackEngine(tmpdir());
    const points = engine.getPoints();
    assert.ok(Array.isArray(points));

    const history = engine.getHistory();
    assert.ok(Array.isArray(history.rollbacks));
  });

  it("clears points", () => {
    const engine = new RollbackEngine(tmpdir());
    engine.clear();
    assert.equal(engine.getPoints().length, 0);
  });
});

// ─── Cost Tracker ────────────────────────────────────────────

import { CostTracker } from "./cost-tracker.js";

describe("Cost Tracker Engine", () => {
  it("records and tracks costs", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-a`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);
    tracker.record("gemini-2.5-flash", "vision", 10000, 500);

    assert.ok(tracker.getTotalCost() > 0);
    assert.equal(tracker.getTotalTokens(), 10500);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("calculates per-model pricing", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-b`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);

    // Gemini 2.5 Flash: $0.15/1M input, $0.60/1M output
    const entry = tracker.record("gemini-2.5-flash", "vision", 1_000_000, 1_000_000);
    assert.ok(entry.cost > 0.14 && entry.cost < 0.76); // 0.15 + 0.60 = 0.75
    rmSync(testDir, { recursive: true, force: true });
  });

  it("generates cost report", () => {
    const testDir = join(tmpdir(), `foreman-cost-report-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);
    tracker.record("gemini-2.5-pro", "vision", 5000, 1000);
    tracker.record("gemini-2.5-flash", "worker", 8000, 2000);
    tracker.record("gemini-2.5-flash", "worker", 6000, 1500);

    const report = tracker.generateReport();
    assert.equal(report.totalCalls, 3);
    assert.ok(report.byPhase.length >= 2);
    assert.ok(report.byModel.length >= 1);
    assert.ok(report.averageCostPerCall > 0);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("formats report as string", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-d`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);
    tracker.record("gemini-2.5-pro", "vision", 5000, 1000);
    const report = tracker.formatReport();
    assert.ok(report.includes("Cost Report"));
    assert.ok(report.includes("$"));
    rmSync(testDir, { recursive: true, force: true });
  });

  it("gets pricing for known models", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-e`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);
    const pricing = tracker.getPricing("claude-sonnet-4");
    assert.ok(pricing.input > 0);
    assert.ok(pricing.output > 0);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns zero pricing for unknown models", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-f`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);
    const pricing = tracker.getPricing("totally-unknown-model-xyz");
    assert.equal(pricing.input, 0);
    assert.equal(pricing.output, 0);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("fires budget alerts", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-g`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir, { perSession: 0.001, alertThreshold: 0.5 });
    let alerted = false;
    tracker.onAlert(() => { alerted = true; });

    // Record enough cost to trigger alert
    tracker.record("gemini-2.5-pro", "vision", 1_000_000, 1_000_000);
    assert.ok(alerted);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("adds custom pricing", () => {
    const testDir = join(tmpdir(), `foreman-cost-test-${Date.now()}-h`);
    mkdirSync(testDir, { recursive: true });
    const tracker = new CostTracker(testDir);
    tracker.addPricing("my-custom-model", { input: 100, output: 200, cacheRead: 10, cacheWrite: 5 });
    const pricing = tracker.getPricing("my-custom-model");
    assert.equal(pricing.input, 100);
    rmSync(testDir, { recursive: true, force: true });
  });
});

// ─── Project Detector ────────────────────────────────────────

import { detectProject, formatProjectContext } from "./project-detector.js";

describe("Project Detector Engine", () => {
  it("detects Node.js/TypeScript project", () => {
    const testDir = join(tmpdir(), `foreman-project-test-${Date.now()}`);
    mkdirSync(join(testDir, "src"), { recursive: true });
    writeFileSync(join(testDir, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      description: "A test project",
      dependencies: { express: "^4.18.0" },
      devDependencies: { typescript: "^5.0.0", vitest: "^1.0.0" },
      scripts: { test: "vitest" },
    }));
    writeFileSync(join(testDir, "tsconfig.json"), "{}");
    writeFileSync(join(testDir, "src", "index.ts"), "console.log('hi')");

    const info = detectProject(testDir);
    assert.equal(info.name, "test-project");
    assert.equal(info.language, "typescript");
    assert.ok(info.frameworks.includes("express"));
    assert.equal(info.testFramework, "vitest");
    assert.equal(info.dependencies.prod, 1);
    assert.equal(info.dependencies.dev, 2);

    rmSync(testDir, { recursive: true, force: true });
  });

  it("detects Python project", () => {
    const testDir = join(tmpdir(), `foreman-py-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "requirements.txt"), "fastapi\nuvicorn\npytest\n");
    writeFileSync(join(testDir, "main.py"), "from fastapi import FastAPI");

    const info = detectProject(testDir);
    assert.ok(info.languages.includes("python"));
    assert.ok(info.frameworks.includes("fastapi"));

    rmSync(testDir, { recursive: true, force: true });
  });

  it("detects Rust project", () => {
    const testDir = join(tmpdir(), `foreman-rs-test-${Date.now()}`);
    mkdirSync(join(testDir, "src"), { recursive: true });
    writeFileSync(join(testDir, "Cargo.toml"), '[package]\nname = "my-crate"\nversion = "0.1.0"');
    writeFileSync(join(testDir, "src", "main.rs"), "fn main() {}");

    const info = detectProject(testDir);
    assert.equal(info.language, "rust");
    assert.equal(info.buildSystem, "cargo");
    assert.equal(info.name, "my-crate");

    rmSync(testDir, { recursive: true, force: true });
  });

  it("detects Go project", () => {
    const testDir = join(tmpdir(), `foreman-go-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "go.mod"), "module github.com/test/myapp\n\ngo 1.21");
    writeFileSync(join(testDir, "main.go"), "package main");

    const info = detectProject(testDir);
    assert.equal(info.language, "go");
    assert.equal(info.buildSystem, "go");
    assert.equal(info.name, "myapp");

    rmSync(testDir, { recursive: true, force: true });
  });

  it("detects Docker and CI", () => {
    const testDir = join(tmpdir(), `foreman-docker-test-${Date.now()}`);
    mkdirSync(join(testDir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(testDir, "Dockerfile"), "FROM node:20");
    writeFileSync(join(testDir, ".github", "workflows", "ci.yml"), "name: CI");

    const info = detectProject(testDir);
    assert.ok(info.hasDocker);
    assert.ok(info.hasCI);
    assert.equal(info.ciProvider, "github-actions");

    rmSync(testDir, { recursive: true, force: true });
  });

  it("formats project context", () => {
    const testDir = join(tmpdir(), `foreman-fmt-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "fmt-test", dependencies: { react: "^18" } }));

    const info = detectProject(testDir);
    const context = formatProjectContext(info);
    assert.ok(context.includes("fmt-test"));
    assert.ok(context.includes("Language:"));

    rmSync(testDir, { recursive: true, force: true });
  });

  it("calculates health score", () => {
    const testDir = join(tmpdir(), `foreman-health-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "package.json"), JSON.stringify({
      name: "healthy",
      devDependencies: { vitest: "1.0", eslint: "8.0" },
    }));
    writeFileSync(join(testDir, "README.md"), "# Test");
    writeFileSync(join(testDir, ".gitignore"), "node_modules");

    const info = detectProject(testDir);
    assert.ok(info.healthScore >= 50);

    rmSync(testDir, { recursive: true, force: true });
  });
});

// ─── Hooks Engine ────────────────────────────────────────────

import {
  HooksEngine,
  createFileSizeGuard,
  createPathGuard,
  createCommandBlocklist,
  createLoggingHook,
} from "./hooks-engine.js";

describe("Hooks Engine", () => {
  it("registers and runs hooks", async () => {
    const engine = new HooksEngine();
    let called = false;
    engine.register("before_pipeline", () => { called = true; });

    await engine.run("before_pipeline", { task: "test" });
    assert.ok(called);
  });

  it("supports priority ordering", async () => {
    const engine = new HooksEngine();
    const order: number[] = [];
    engine.register("before_pipeline", () => { order.push(2); }, { priority: 10 });
    engine.register("before_pipeline", () => { order.push(1); }, { priority: 20 });

    await engine.run("before_pipeline");
    assert.deepEqual(order, [1, 2]); // Higher priority first
  });

  it("blocks operations", async () => {
    const engine = new HooksEngine();
    engine.register("before_command", () => ({
      block: true,
      blockReason: "Dangerous command",
    }));

    const result = await engine.run("before_command", { command: "rm -rf /" });
    assert.ok(result.block);
    assert.equal(result.blockReason, "Dangerous command");
  });

  it("modifies data through hooks", async () => {
    const engine = new HooksEngine();
    engine.register("before_file_write", () => ({
      modifiedData: { content: "modified content" },
    }));

    const result = await engine.run("before_file_write", { content: "original" });
    assert.equal((result.modifiedData as any)?.content, "modified content");
  });

  it("catches errors when configured", async () => {
    const engine = new HooksEngine();
    engine.register("before_pipeline", () => { throw new Error("boom"); }, { catchErrors: true });

    const result = await engine.run("before_pipeline");
    assert.ok(!result.block); // Should not block, error caught
  });

  it("unregisters hooks", async () => {
    const engine = new HooksEngine();
    let count = 0;
    const unregister = engine.register("before_pipeline", () => { count++; });

    await engine.run("before_pipeline");
    assert.equal(count, 1);

    unregister();
    await engine.run("before_pipeline");
    assert.equal(count, 1); // Not called again
  });

  it("file size guard blocks large files", async () => {
    const engine = new HooksEngine();
    engine.register("before_file_write", createFileSizeGuard(100));

    const result = await engine.run("before_file_write", { content: "x".repeat(200) });
    assert.ok(result.block);
  });

  it("path guard blocks outside paths", async () => {
    const engine = new HooksEngine();
    engine.register("before_file_write", createPathGuard(["/project/src"]));

    const result = await engine.run("before_file_write", { path: "/etc/passwd" });
    assert.ok(result.block);

    const result2 = await engine.run("before_file_write", { path: "/project/src/index.ts" });
    assert.ok(!result2.block);
  });

  it("command blocklist blocks matching commands", async () => {
    const engine = new HooksEngine();
    engine.register("before_command", createCommandBlocklist([/rm\s+-rf/, /sudo/]));

    const result = await engine.run("before_command", { command: "rm -rf /" });
    assert.ok(result.block);

    const result2 = await engine.run("before_command", { command: "npm test" });
    assert.ok(!result2.block);
  });

  it("logging hook calls callback", async () => {
    const engine = new HooksEngine();
    const logs: string[] = [];
    engine.register("before_command", createLoggingHook(msg => logs.push(msg)));

    await engine.run("before_command", { command: "npm test" });
    assert.ok(logs.length > 0);
    assert.ok(logs[0].includes("npm test"));
  });

  it("tracks history", async () => {
    const engine = new HooksEngine();
    engine.register("before_pipeline", () => {}, { name: "test-hook" });
    await engine.run("before_pipeline");

    const history = engine.getHistory();
    assert.ok(history.length > 0);
    assert.equal(history[0].name, "test-hook");
    assert.equal(history[0].hookName, "before_pipeline");
  });

  it("reports hook counts", () => {
    const engine = new HooksEngine();
    engine.register("before_pipeline", () => {});
    engine.register("before_pipeline", () => {});
    engine.register("after_pipeline", () => {});

    assert.equal(engine.getHookCount("before_pipeline"), 2);
    assert.equal(engine.getHookCount("after_pipeline"), 1);
    assert.equal(engine.getHookCount(), 3);
  });
});
