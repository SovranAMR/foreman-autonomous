/**
 * FOREMAN — Project Manager
 *
 * Proje CRUD ve task organizasyonu.
 * Her proje: {projectRoot}/projects/proj_XXX.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "./types.js";

export interface CreateProjectInput {
  name: string;
  description: string;
  vision?: string;
}

export class ProjectManager {
  private readonly projectsDir: string;

  constructor(private readonly projectRoot: string) {
    this.projectsDir = join(projectRoot, "projects");
  }

  create(input: CreateProjectInput): Project {
    this.ensureDir();

    const id = this.nextId();
    const project: Project = {
      id,
      name: input.name,
      description: input.description,
      vision: input.vision,
      taskIds: [],
      status: "planning",
      createdAt: new Date().toISOString(),
      totalTokens: 0,
    };

    this.writeToDisk(project);
    return project;
  }

  get(id: string): Project | null {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as Project;
    } catch {
      return null;
    }
  }

  update(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Project {
    const existing = this.get(id);
    if (!existing) throw new Error(`Project not found: ${id}`);
    const updated = { ...existing, ...patch };
    this.writeToDisk(updated);
    return updated;
  }

  addTask(projectId: string, taskId: string): Project {
    const project = this.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (!project.taskIds.includes(taskId)) {
      project.taskIds.push(taskId);
      this.writeToDisk(project);
    }
    return project;
  }

  list(): Project[] {
    this.ensureDir();
    const files = readdirSync(this.projectsDir)
      .filter(f => f.startsWith("proj_") && f.endsWith(".json"))
      .sort();

    return files.map(f => {
      try {
        return JSON.parse(readFileSync(join(this.projectsDir, f), "utf-8")) as Project;
      } catch {
        return null;
      }
    }).filter((p): p is Project => p !== null);
  }

  private filePath(id: string): string {
    return join(this.projectsDir, `${id}.json`);
  }

  private writeToDisk(project: Project): void {
    writeFileSync(this.filePath(project.id), JSON.stringify(project, null, 2), "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.projectsDir)) {
      mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  private nextId(): string {
    this.ensureDir();
    const files = readdirSync(this.projectsDir)
      .filter(f => f.startsWith("proj_") && f.endsWith(".json"));
    if (files.length === 0) return "proj_001";
    const numbers = files.map(f => {
      const match = f.match(/proj_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    return `proj_${(Math.max(...numbers) + 1).toString().padStart(3, "0")}`;
  }
}
