/**
 * FOREMAN — Task Manager
 *
 * Task management: create, update, resolve dependencies, sort.
 * Her task: {projectRoot}/tasks/task_XXX.json
 *
 * Task distribution in the pipeline works as follows:
 * 1. Visioner defines the project
 * 2. Strategist creates tasks (decompose → task)
 * 3. TaskManager resolves dependencies, determines order
 * 4. Each task is given to the orchestrator in sequence
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Task, TaskStatus, TaskPriority, TaskType, Layer } from "./types.js";

// ─── INPUT TYPES ──────────────────────────────────────────────

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description: string;
  type?: TaskType;
  priority?: TaskPriority;
  parentTaskId?: string;
  dependsOn?: string[];
  tags?: string[];
  effort?: number;
  acceptanceCriteria?: string[];
  assignedLayer?: Layer;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignedLayer?: Layer;
  dependsOn?: string[];
  tags?: string[];
  effort?: number;
  acceptanceCriteria?: string[];
  blockedReason?: string;
  startedAt?: string;
  completedAt?: string;
  totalTokens?: number;
  notes?: string[];
}

export interface TaskFilter {
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  parentTaskId?: string;
  tag?: string;
  assignedLayer?: Layer;
}

// ─── TASK MANAGER ────────────────────────────────────────────

export class TaskManager {
  private readonly tasksDir: string;

  constructor(private readonly projectRoot: string) {
    this.tasksDir = join(projectRoot, "tasks");
  }

  /**
   * Create a new task.
   */
  create(input: CreateTaskInput): Task {
    this.ensureDir();

    const id = this.nextId();
    const task: Task = {
      id,
      projectId: input.projectId,
      parentTaskId: input.parentTaskId,
      title: input.title,
      description: input.description,
      type: input.type ?? "feature",
      priority: input.priority ?? "medium",
      status: "backlog",
      assignedLayer: input.assignedLayer,
      dependsOn: input.dependsOn ?? [],
      chainIds: [],
      subtaskIds: [],
      tags: input.tags ?? [],
      effort: input.effort,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      totalTokens: 0,
      notes: [],
      createdAt: new Date().toISOString(),
    };

    this.writeToDisk(task);
    return task;
  }

  /**
   * Task oku.
   */
  get(id: string): Task | null {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as Task;
    } catch {
      return null;
    }
  }

  /**
   * Update a task.
   */
  update(id: string, patch: UpdateTaskInput): Task {
    const existing = this.get(id);
    if (!existing) throw new Error(`Task not found: ${id}`);

    const updated: Task = { ...existing, ...patch };

    // Automatic timestamp on status transitions
    if (patch.status === "in_progress" && !existing.startedAt) {
      updated.startedAt = new Date().toISOString();
    }
    if (patch.status === "done" && !existing.completedAt) {
      updated.completedAt = new Date().toISOString();
    }

    this.writeToDisk(updated);
    return updated;
  }

  /**
   * Attach a chain to a task.
   */
  addChain(taskId: string, chainId: string): Task {
    const task = this.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.chainIds.includes(chainId)) {
      task.chainIds.push(chainId);
      this.writeToDisk(task);
    }
    return task;
  }

  /**
   * Attach a subtask to a task.
   */
  addSubtask(parentId: string, subtaskId: string): Task {
    const parent = this.get(parentId);
    if (!parent) throw new Error(`Task not found: ${parentId}`);
    if (!parent.subtaskIds.includes(subtaskId)) {
      parent.subtaskIds.push(subtaskId);
      this.writeToDisk(parent);
    }
    return parent;
  }

  /**
   * Task'a not ekle.
   */
  addNote(taskId: string, note: string): Task {
    const task = this.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.notes.push(`[${new Date().toISOString().slice(0, 19)}] ${note}`);
    this.writeToDisk(task);
    return task;
  }

  /**
   * List all tasks (with filter).
   */
  list(filter?: TaskFilter): Task[] {
    this.ensureDir();

    const files = readdirSync(this.tasksDir)
      .filter(f => f.startsWith("task_") && f.endsWith(".json"))
      .sort();

    const tasks: Task[] = [];
    for (const file of files) {
      try {
        const task = JSON.parse(readFileSync(join(this.tasksDir, file), "utf-8")) as Task;

        if (filter?.projectId && task.projectId !== filter.projectId) continue;
        if (filter?.status && task.status !== filter.status) continue;
        if (filter?.priority && task.priority !== filter.priority) continue;
        if (filter?.type && task.type !== filter.type) continue;
        if (filter?.parentTaskId && task.parentTaskId !== filter.parentTaskId) continue;
        if (filter?.tag && !task.tags.includes(filter.tag)) continue;
        if (filter?.assignedLayer && task.assignedLayer !== filter.assignedLayer) continue;

        tasks.push(task);
      } catch { /* skip corrupt file */ }
    }

    return tasks;
  }

  // ─── DEPENDENCY RESOLUTION ─────────────────────────────────

  /**
   * Check if a task is ready to start.
   * All dependencies are "done" or "cancelled" → ready.
   */
  isReady(taskId: string): boolean {
    const task = this.get(taskId);
    if (!task) return false;
    if (task.dependsOn.length === 0) return true;

    return task.dependsOn.every(depId => {
      const dep = this.get(depId);
      return dep && (dep.status === "done" || dep.status === "cancelled");
    });
  }

  /**
   * Return all ready tasks.
   * Tasks with resolved dependencies, ready to start.
   */
  getReadyTasks(projectId?: string): Task[] {
    const all = this.list({ projectId, status: "backlog" });
    return all.filter(t => this.isReady(t.id));
  }

  /**
   * Dependency cycle detection.
   * Traverses with DFS, returns true if a cycle is found.
   */
  hasCycle(taskId: string): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string): boolean => {
      if (stack.has(id)) return true; // cycle!
      if (visited.has(id)) return false;

      visited.add(id);
      stack.add(id);

      const task = this.get(id);
      if (task) {
        for (const depId of task.dependsOn) {
          if (dfs(depId)) return true;
        }
      }

      stack.delete(id);
      return false;
    };

    return dfs(taskId);
  }

  /**
   * Topological sort — task list in dependency order.
   * Tasks without dependencies first, dependent ones after.
   */
  topologicalSort(projectId?: string): Task[] {
    const all = this.list({ projectId });
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Build graph
    for (const task of all) {
      inDegree.set(task.id, task.dependsOn.length);
      for (const dep of task.dependsOn) {
        if (!adjList.has(dep)) adjList.set(dep, []);
        adjList.get(dep)!.push(task.id);
      }
    }

    // BFS (Kahn's algorithm)
    const queue: string[] = [];
    for (const task of all) {
      if ((inDegree.get(task.id) ?? 0) === 0) {
        queue.push(task.id);
      }
    }

    const sorted: Task[] = [];
    while (queue.length > 0) {
      // Priority order: critical > high > medium > low
      queue.sort((a, b) => {
        const ta = all.find(t => t.id === a)!;
        const tb = all.find(t => t.id === b)!;
        const prio: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (prio[ta.priority] ?? 2) - (prio[tb.priority] ?? 2);
      });

      const current = queue.shift()!;
      const task = all.find(t => t.id === current);
      if (task) sorted.push(task);

      for (const neighbor of adjList.get(current) ?? []) {
        const deg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  // ─── STATISTICS ────────────────────────────────────────────

  /**
   * Proje istatistikleri.
   */
  stats(projectId?: string): TaskStats {
    const all = this.list({ projectId });
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalTokens = 0;
    let totalEffort = 0;
    let doneEffort = 0;

    for (const t of all) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      byType[t.type] = (byType[t.type] ?? 0) + 1;
      totalTokens += t.totalTokens;
      if (t.effort) {
        totalEffort += t.effort;
        if (t.status === "done") doneEffort += t.effort;
      }
    }

    return {
      total: all.length,
      byStatus,
      byPriority,
      byType,
      totalTokens,
      totalEffort,
      doneEffort,
      progress: totalEffort > 0 ? Math.round((doneEffort / totalEffort) * 100) : 0,
      blockers: all.filter(t => t.status === "blocked").map(t => ({
        id: t.id,
        title: t.title,
        reason: t.blockedReason ?? "Unknown",
      })),
    };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private filePath(id: string): string {
    return join(this.tasksDir, `${id}.json`);
  }

  private writeToDisk(task: Task): void {
    writeFileSync(this.filePath(task.id), JSON.stringify(task, null, 2), "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.tasksDir)) {
      mkdirSync(this.tasksDir, { recursive: true });
    }
  }

  private nextId(): string {
    this.ensureDir();
    const files = readdirSync(this.tasksDir)
      .filter(f => f.startsWith("task_") && f.endsWith(".json"));

    if (files.length === 0) return "task_001";

    const numbers = files.map(f => {
      const match = f.match(/task_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });

    return `task_${(Math.max(...numbers) + 1).toString().padStart(3, "0")}`;
  }
}

// ─── STATS TYPE ──────────────────────────────────────────────

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  totalTokens: number;
  totalEffort: number;
  doneEffort: number;
  progress: number;
  blockers: { id: string; title: string; reason: string }[];
}
