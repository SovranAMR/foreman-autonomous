/**
 * FOREMAN — Task System Tests
 *
 * Task CRUD, bağımlılık çözme, topolojik sıralama,
 * döngü tespiti, istatistikler.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskManager } from "./task-manager.js";
import { ProjectManager } from "./project-manager.js";

const PASS = "✅";
const FAIL = "❌";
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.error(`   ${err}`);
    failed++;
  }
}

async function run() {
  const tempDir = mkdtempSync(join(tmpdir(), "foreman-task-test-"));

  const projects = new ProjectManager(tempDir);
  const tasks = new TaskManager(tempDir);

  // ─── PROJECT CRUD ────────────────────────────────────────

  await test("Project: create", () => {
    const p = projects.create({
      name: "Eyricediş Website",
      description: "Şov level diş klinik sitesi",
    });
    assert.equal(p.id, "proj_001");
    assert.equal(p.status, "planning");
    assert.equal(p.taskIds.length, 0);
  });

  await test("Project: get", () => {
    const p = projects.get("proj_001");
    assert.ok(p);
    assert.equal(p!.name, "Eyricediş Website");
  });

  await test("Project: update", () => {
    const p = projects.update("proj_001", {
      status: "active",
      vision: "Dark theme, gold accents, mobile-first, award-winning",
    });
    assert.equal(p.status, "active");
    assert.ok(p.vision!.includes("gold"));
  });

  // ─── TASK CRUD ───────────────────────────────────────────

  await test("Task: create", () => {
    const t = tasks.create({
      projectId: "proj_001",
      title: "Hero Section",
      description: "Şov level hero with smile arc animation",
      type: "feature",
      priority: "critical",
      tags: ["hero", "animation"],
      effort: 5,
      acceptanceCriteria: [
        "60fps on mobile",
        "Canvas-based animation",
        "Mobile-first layout",
      ],
    });
    assert.equal(t.id, "task_001");
    assert.equal(t.status, "backlog");
    assert.equal(t.priority, "critical");
    assert.equal(t.tags.length, 2);
    assert.equal(t.acceptanceCriteria.length, 3);
  });

  await test("Task: create with dependency", () => {
    const t = tasks.create({
      projectId: "proj_001",
      title: "Services Section",
      description: "Glassmorphism service cards",
      priority: "high",
      dependsOn: ["task_001"], // Hero must come first
      effort: 3,
    });
    assert.equal(t.id, "task_002");
    assert.deepEqual(t.dependsOn, ["task_001"]);
  });

  await test("Task: create subtask", () => {
    const sub = tasks.create({
      projectId: "proj_001",
      title: "Hero background gradient",
      description: "Radial gold gradient for hero",
      parentTaskId: "task_001",
      priority: "high",
      effort: 1,
    });
    assert.equal(sub.parentTaskId, "task_001");

    tasks.addSubtask("task_001", sub.id);
    const parent = tasks.get("task_001");
    assert.ok(parent!.subtaskIds.includes(sub.id));
  });

  await test("Task: get and update", () => {
    const t = tasks.update("task_001", {
      status: "in_progress",
      assignedLayer: "worker",
    });
    assert.equal(t.status, "in_progress");
    assert.ok(t.startedAt); // otomatik zaman damgası
    assert.equal(t.assignedLayer, "worker");
  });

  await test("Task: add note", () => {
    const t = tasks.addNote("task_001", "Canvas performansı test edildi, 60fps OK");
    assert.equal(t.notes.length, 1);
    assert.ok(t.notes[0].includes("Canvas performansı"));
  });

  await test("Task: add chain", () => {
    const t = tasks.addChain("task_001", "chain_001");
    assert.ok(t.chainIds.includes("chain_001"));
  });

  // ─── LISTING & FILTERING ─────────────────────────────────

  await test("Task: list all", () => {
    const all = tasks.list();
    assert.equal(all.length, 3); // task_001, task_002, task_003 (subtask)
  });

  await test("Task: filter by status", () => {
    const active = tasks.list({ status: "in_progress" });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "task_001");
  });

  await test("Task: filter by priority", () => {
    const critical = tasks.list({ priority: "critical" });
    assert.equal(critical.length, 1);
  });

  await test("Task: filter by tag", () => {
    const animated = tasks.list({ tag: "animation" });
    assert.equal(animated.length, 1);
    assert.equal(animated[0].id, "task_001");
  });

  await test("Task: filter by parent (subtasks)", () => {
    const subs = tasks.list({ parentTaskId: "task_001" });
    assert.equal(subs.length, 1);
    assert.equal(subs[0].title, "Hero background gradient");
  });

  // ─── DEPENDENCY RESOLUTION ───────────────────────────────

  // Mevcut durum: task_001=in_progress, task_002 depends on task_001
  await test("Dependency: task_002 not ready (task_001 in_progress)", () => {
    assert.equal(tasks.isReady("task_002"), false);
  });

  await test("Dependency: task_001 ready (no deps)", () => {
    assert.equal(tasks.isReady("task_001"), true);
  });

  await test("Dependency: task_002 ready after task_001 done", () => {
    tasks.update("task_001", { status: "done" });
    assert.equal(tasks.isReady("task_002"), true);
  });

  await test("Dependency: getReadyTasks returns only unblocked backlog", () => {
    const ready = tasks.getReadyTasks("proj_001");
    // task_002 is backlog + ready (task_001 done)
    // task_003 is backlog + ready (no deps)
    assert.ok(ready.length >= 1);
    assert.ok(ready.some(t => t.id === "task_002"));
  });

  // ─── CYCLE DETECTION ─────────────────────────────────────

  await test("Cycle: no cycle in normal deps", () => {
    assert.equal(tasks.hasCycle("task_002"), false);
  });

  await test("Cycle: detects circular dependency", () => {
    // task_004 depends on task_005, task_005 depends on task_004
    tasks.create({
      projectId: "proj_001",
      title: "Circular A",
      description: "test",
      dependsOn: ["task_005"],
    });
    tasks.create({
      projectId: "proj_001",
      title: "Circular B",
      description: "test",
      dependsOn: ["task_004"],
    });
    assert.equal(tasks.hasCycle("task_004"), true);
    assert.equal(tasks.hasCycle("task_005"), true);
  });

  // ─── TOPOLOGICAL SORT ────────────────────────────────────

  await test("TopSort: returns tasks in dependency order", () => {
    // Separate project to avoid cycles from above
    const tempDir2 = mkdtempSync(join(tmpdir(), "foreman-topo-test-"));
    const tm = new TaskManager(tempDir2);

    tm.create({ projectId: "p", title: "Foundation", description: "base", priority: "critical" });
    tm.create({ projectId: "p", title: "Walls", description: "walls", priority: "high", dependsOn: ["task_001"] });
    tm.create({ projectId: "p", title: "Roof", description: "roof", priority: "medium", dependsOn: ["task_002"] });
    tm.create({ projectId: "p", title: "Paint", description: "paint", priority: "low", dependsOn: ["task_002"] });

    const sorted = tm.topologicalSort("p");
    const ids = sorted.map(t => t.id);

    // Foundation must come before Walls
    assert.ok(ids.indexOf("task_001") < ids.indexOf("task_002"));
    // Walls must come before Roof
    assert.ok(ids.indexOf("task_002") < ids.indexOf("task_003"));
    // Walls must come before Paint
    assert.ok(ids.indexOf("task_002") < ids.indexOf("task_004"));
  });

  await test("TopSort: priority breaks ties", () => {
    const tempDir3 = mkdtempSync(join(tmpdir(), "foreman-prio-test-"));
    const tm = new TaskManager(tempDir3);

    tm.create({ projectId: "p", title: "Low prio", description: "x", priority: "low" });
    tm.create({ projectId: "p", title: "Critical", description: "x", priority: "critical" });
    tm.create({ projectId: "p", title: "High prio", description: "x", priority: "high" });

    const sorted = tm.topologicalSort("p");
    // Critical should come first (no deps, highest priority)
    assert.equal(sorted[0].priority, "critical");
  });

  // ─── STATISTICS ──────────────────────────────────────────

  await test("Stats: correct counts", () => {
    const s = tasks.stats("proj_001");
    assert.equal(s.total, 5); // task_001-005
    assert.ok(s.byStatus["done"] >= 1);
    assert.ok(s.byPriority["critical"] >= 1);
    assert.ok(s.totalEffort > 0);
    assert.ok(s.progress >= 0);
  });

  await test("Stats: blockers listed", () => {
    tasks.update("task_002", { status: "blocked", blockedReason: "API key missing" });
    const s = tasks.stats("proj_001");
    assert.ok(s.blockers.length >= 1);
    assert.ok(s.blockers.some(b => b.reason.includes("API key")));
  });

  // ─── PROJECT-TASK INTEGRATION ────────────────────────────

  await test("Project: addTask links project and task", () => {
    projects.addTask("proj_001", "task_001");
    projects.addTask("proj_001", "task_002");
    const p = projects.get("proj_001");
    assert.ok(p!.taskIds.includes("task_001"));
    assert.ok(p!.taskIds.includes("task_002"));
  });

  await test("Project: list returns all projects", () => {
    const all = projects.list();
    assert.equal(all.length, 1);
  });

  // ─── DONE ────────────────────────────────────────────────

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
