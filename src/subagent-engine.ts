/**
 * FOREMAN — Sub-Agent Engine
 *
 * Spawn, manage, and coordinate multiple agent instances.
 * Each sub-agent runs its own forge pipeline independently.
 *
 * OpenClaw'dan alınan: sessions_spawn + subagent-registry concepts
 * Foreman farkı: Forge-pipeline-based sub-agents, team coordination,
 *                parent-child relationship, shared memory, result aggregation
 *
 * Capabilities:
 * - Spawn sub-agents with isolated sessions
 * - Parent-child linking (sub-agent knows who spawned it)
 * - Concurrent execution with concurrency limits
 * - Inter-agent messaging
 * - Shared memory access (read-only for sub-agents)
 * - Result aggregation (collect all sub-agent outputs)
 * - Sub-agent lifecycle management (start/stop/kill)
 * - Team coordination (divide work, assign roles)
 * - Status monitoring
 * - Timeout and auto-kill
 */

import { EventEmitter } from "node:events";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

// ─── TYPES ───────────────────────────────────────────────────

export interface SubAgentConfig {
  /** Task for the sub-agent to execute */
  task: string;
  /** Optional label for identification */
  label?: string;
  /** Role in the team (e.g., "frontend", "backend", "tests") */
  role?: string;
  /** Maximum runtime in ms (default: 5 minutes) */
  timeoutMs?: number;
  /** Model override for this sub-agent */
  model?: string;
  /** Shared context from parent */
  parentContext?: string;
  /** Whether sub-agent can write to shared memory */
  canWriteMemory?: boolean;
  /** Working directory override */
  workDir?: string;
  /** Priority (higher = runs first when concurrency limited) */
  priority?: number;
}

export interface SubAgent {
  id: string;
  label: string;
  role?: string;
  task: string;
  status: SubAgentStatus;
  startedAt: number;
  finishedAt?: number;
  result?: SubAgentResult;
  error?: string;
  parentId?: string;
  childIds: string[];
  messages: SubAgentMessage[];
}

export type SubAgentStatus = "pending" | "running" | "completed" | "failed" | "killed" | "timeout";

export interface SubAgentResult {
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  tokensUsed: number;
  thoughtCount: number;
  duration: number;
}

export interface SubAgentMessage {
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export interface TeamPlan {
  name: string;
  agents: SubAgentConfig[];
  strategy: "parallel" | "sequential" | "pipeline";
  /** For pipeline strategy: output of agent N feeds into agent N+1 */
  pipelineContext?: boolean;
}

// ─── SUB-AGENT ENGINE ────────────────────────────────────────

import { AgentRegistry } from "./agent-mesh/agent-registry.js";
import type { AgentRole } from "./agent-mesh/types.js";

export class SubAgentEngine extends EventEmitter {
  private agents = new Map<string, SubAgent>();
  private maxConcurrent: number;
  private activeCount = 0;
  private pendingQueue: Array<{ agent: SubAgent; config: SubAgentConfig }> = [];
  private executors = new Map<string, (agent: SubAgent, config: SubAgentConfig) => Promise<SubAgentResult>>();
  
  // AGENT MESH INTEGRATION (Phase 1)
  private registry: AgentRegistry;
  private enableMesh: boolean;

  constructor(options?: { maxConcurrent?: number; enableMesh?: boolean }) {
    super();
    this.maxConcurrent = options?.maxConcurrent ?? 3;
    this.enableMesh = options?.enableMesh ?? true;
    this.registry = new AgentRegistry();
    
    // Forward registry events
    this.setupRegistryEventForwarding();
  }
  
  private setupRegistryEventForwarding(): void {
    if (!this.enableMesh) return;
    
    this.registry.on("agent.registered", (e) => this.emit("mesh:registered", e));
    this.registry.on("agent.state.changed", (e) => this.emit("mesh:stateChanged", e));
    this.registry.on("agent.heartbeat", (e) => this.emit("mesh:heartbeat", e));
    this.registry.on("agent.blocked", (e) => this.emit("mesh:blocked", e));
    this.registry.on("agent.completed", (e) => this.emit("mesh:completed", e));
    this.registry.on("agent.failed", (e) => this.emit("mesh:failed", e));
  }

  /**
   * Register a task executor. The executor function runs the actual work.
   * Default executor calls forge pipeline.
   */
  registerExecutor(
    name: string,
    executor: (agent: SubAgent, config: SubAgentConfig) => Promise<SubAgentResult>,
  ): void {
    this.executors.set(name, executor);
  }

  /**
   * Spawn a single sub-agent.
   */
  async spawn(config: SubAgentConfig, parentId?: string): Promise<SubAgent> {
    const agent: SubAgent = {
      id: `sa_${Date.now()}_${randomUUID().slice(0, 6)}`,
      label: config.label ?? `agent-${this.agents.size + 1}`,
      role: config.role,
      task: config.task,
      status: "pending",
      startedAt: Date.now(),
      parentId,
      childIds: [],
      messages: [],
    };

    this.agents.set(agent.id, agent);
    
    // AGENT MESH: Register in registry (Phase 1)
    if (this.enableMesh) {
      const role = (config.role?.toUpperCase() as AgentRole) || "WORKER";
      this.registry.registerFromSubAgent(agent.id, config.task, role, parentId);
      this.registry.updateState(agent.id, { status: "REGISTERED" });
    }

    // Link to parent
    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) parent.childIds.push(agent.id);
    }

    this.emit("spawned", agent);

    // Queue or execute
    if (this.activeCount < this.maxConcurrent) {
      this.executeAgent(agent, config);
    } else {
      this.pendingQueue.push({ agent, config });
      this.pendingQueue.sort((a, b) => (b.config.priority ?? 0) - (a.config.priority ?? 0));
    }

    return agent;
  }

  /**
   * Spawn a team of sub-agents with a coordination strategy.
   */
  async spawnTeam(plan: TeamPlan): Promise<SubAgent[]> {
    const agents: SubAgent[] = [];

    switch (plan.strategy) {
      case "parallel": {
        // All agents run concurrently
        const promises = plan.agents.map(config =>
          this.spawn({ ...config, label: config.label ?? `${plan.name}-${agents.length}` }),
        );
        const spawned = await Promise.all(promises);
        agents.push(...spawned);
        break;
      }

      case "sequential": {
        // Agents run one after another
        for (const config of plan.agents) {
          const agent = await this.spawn({
            ...config,
            label: config.label ?? `${plan.name}-${agents.length}`,
          });
          // Wait for completion before spawning next
          await this.waitForAgent(agent.id);
          agents.push(agent);
        }
        break;
      }

      case "pipeline": {
        // Output of agent N feeds into agent N+1
        let previousOutput = "";
        for (let i = 0; i < plan.agents.length; i++) {
          const config = plan.agents[i];
          const contextualTask = previousOutput
            ? `${config.task}\n\nContext from previous step:\n${previousOutput}`
            : config.task;

          const agent = await this.spawn({
            ...config,
            task: contextualTask,
            label: config.label ?? `${plan.name}-step${i + 1}`,
          });

          await this.waitForAgent(agent.id);
          previousOutput = agent.result?.output ?? "";
          agents.push(agent);
        }
        break;
      }
    }

    return agents;
  }

  /**
   * Send a message to a sub-agent.
   */
  sendMessage(fromId: string, toId: string, content: string): boolean {
    const target = this.agents.get(toId);
    if (!target) return false;

    const message: SubAgentMessage = {
      from: fromId,
      to: toId,
      content,
      timestamp: Date.now(),
    };

    target.messages.push(message);
    this.emit("message", message);
    return true;
  }

  /**
   * Kill a sub-agent.
   */
  kill(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "running") return false;

    agent.status = "killed";
    agent.finishedAt = Date.now();
    this.activeCount = Math.max(0, this.activeCount - 1);
    
    // AGENT MESH: Update registry
    if (this.enableMesh) {
      this.registry.terminate(agentId, "Killed by orchestrator");
    }
    
    this.emit("killed", agent);
    this.drainQueue();
    return true;
  }

  /**
   * Get agent by ID.
   */
  get(agentId: string): SubAgent | undefined {
    return this.agents.get(agentId);
  }
  
  /**
   * AGENT MESH: Get underlying registry for advanced operations.
   */
  getRegistry(): AgentRegistry | undefined {
    return this.enableMesh ? this.registry : undefined;
  }
  
  /**
   * AGENT MESH: Get global metrics across all agents.
   */
  getMeshMetrics() {
    if (!this.enableMesh) return null;
    return this.registry.getGlobalMetrics();
  }
  
  /**
   * AGENT MESH: Get healthy agents (health score >= 70).
   */
  getHealthyAgents() {
    if (!this.enableMesh) return [];
    return this.registry.getHealthy();
  }
  
  /**
   * AGENT MESH: Send heartbeat for an agent (for external health checks).
   */
  heartbeat(agentId: string, updates?: { progress?: number; healthScore?: number }): void {
    if (!this.enableMesh) return;
    this.registry.heartbeat(agentId, updates);
  }

  /**
   * List all agents.
   */
  list(filter?: { status?: SubAgentStatus; role?: string; parentId?: string }): SubAgent[] {
    let result = [...this.agents.values()];

    if (filter?.status) result = result.filter(a => a.status === filter.status);
    if (filter?.role) result = result.filter(a => a.role === filter.role);
    if (filter?.parentId) result = result.filter(a => a.parentId === filter.parentId);

    return result.sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Wait for an agent to complete.
   */
  waitForAgent(agentId: string, timeoutMs = 300_000): Promise<SubAgent> {
    return new Promise((resolve, reject) => {
      const agent = this.agents.get(agentId);
      if (!agent) return reject(new Error(`Agent ${agentId} not found`));
      if (agent.status !== "pending" && agent.status !== "running") return resolve(agent);

      const timer = setTimeout(() => {
        agent.status = "timeout";
        agent.finishedAt = Date.now();
        reject(new Error(`Agent ${agentId} timed out`));
      }, timeoutMs);
      timer.unref();

      const check = () => {
        const a = this.agents.get(agentId);
        if (a && a.status !== "pending" && a.status !== "running") {
          clearTimeout(timer);
          resolve(a);
        }
      };

      this.on("completed", check);
      this.on("failed", check);
      this.on("killed", check);
    });
  }

  /**
   * Wait for all agents in a list to complete.
   */
  async waitForAll(agentIds: string[], timeoutMs = 600_000): Promise<SubAgent[]> {
    return Promise.all(agentIds.map(id => this.waitForAgent(id, timeoutMs)));
  }

  /**
   * Aggregate results from multiple sub-agents.
   */
  aggregateResults(agentIds: string[]): {
    totalAgents: number;
    succeeded: number;
    failed: number;
    totalTokens: number;
    totalDuration: number;
    outputs: string[];
    filesCreated: string[];
    filesModified: string[];
  } {
    const agents = agentIds.map(id => this.agents.get(id)).filter(Boolean) as SubAgent[];

    return {
      totalAgents: agents.length,
      succeeded: agents.filter(a => a.status === "completed" && a.result?.success).length,
      failed: agents.filter(a => a.status === "failed" || (a.result && !a.result.success)).length,
      totalTokens: agents.reduce((sum, a) => sum + (a.result?.tokensUsed ?? 0), 0),
      totalDuration: agents.reduce((sum, a) => sum + (a.result?.duration ?? 0), 0),
      outputs: agents.map(a => a.result?.output ?? "").filter(Boolean),
      filesCreated: agents.flatMap(a => a.result?.filesCreated ?? []),
      filesModified: agents.flatMap(a => a.result?.filesModified ?? []),
    };
  }

  /**
   * Get summary status.
   */
  getStatus(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    killed: number;
  } {
    const all = [...this.agents.values()];
    return {
      total: all.length,
      pending: all.filter(a => a.status === "pending").length,
      running: all.filter(a => a.status === "running").length,
      completed: all.filter(a => a.status === "completed").length,
      failed: all.filter(a => a.status === "failed").length,
      killed: all.filter(a => a.status === "killed").length,
    };
  }

  /**
   * Clear completed/failed agents.
   */
  cleanup(): void {
    for (const [id, agent] of this.agents) {
      if (agent.status !== "pending" && agent.status !== "running") {
        this.agents.delete(id);
      }
    }
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private async executeAgent(agent: SubAgent, config: SubAgentConfig): Promise<void> {
    agent.status = "running";
    this.activeCount++;
    this.emit("started", agent);
    
    // AGENT MESH: Update registry status
    if (this.enableMesh) {
      this.registry.updateState(agent.id, { 
        status: "BUSY",
        startedAt: new Date()
      });
    }

    // Set timeout
    const timeoutMs = config.timeoutMs ?? 300_000;
    const timer = setTimeout(() => {
      if (agent.status === "running") {
        agent.status = "timeout";
        agent.finishedAt = Date.now();
        agent.error = `Timed out after ${timeoutMs}ms`;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.emit("timeout", agent);
        
        // AGENT MESH: Update registry
        if (this.enableMesh) {
          this.registry.updateState(agent.id, { 
            status: "FAILED",
            blockedReason: `Timeout after ${timeoutMs}ms`
          });
        }
        
        this.drainQueue();
      }
    }, timeoutMs);
    timer.unref();

    try {
      // Use registered executor or default
      const executor = this.executors.get("default") ?? this.defaultExecutor;
      const result = await executor(agent, config);

      clearTimeout(timer);
      agent.result = result;
      agent.status = result.success ? "completed" : "failed";
      agent.finishedAt = Date.now();
      
      // AGENT MESH: Update registry with completion
      if (this.enableMesh) {
        this.registry.updateState(agent.id, { 
          status: result.success ? "COMPLETED" : "FAILED",
          progress: result.success ? 100 : agent.state?.progress || 0,
          tokensUsed: result.tokensUsed
        });
        
        if (result.success) {
          this.registry.emit("agent.completed", { 
            agentId: agent.id, 
            output: {
              files: [...result.filesCreated, ...result.filesModified],
              summary: result.output,
              artifacts: {},
              metrics: {
                totalOperations: result.thoughtCount,
                successfulOperations: result.success ? result.thoughtCount : 0,
                failedOperations: result.success ? 0 : result.thoughtCount,
                averageOperationDuration: result.duration / Math.max(1, result.thoughtCount),
                totalDuration: result.duration
              }
            }
          });
        }
      }
      
      this.emit(result.success ? "completed" : "failed", agent);
    } catch (err) {
      clearTimeout(timer);
      agent.status = "failed";
      agent.error = err instanceof Error ? err.message : String(err);
      agent.finishedAt = Date.now();
      
      // AGENT MESH: Update registry with failure
      if (this.enableMesh) {
        this.registry.updateState(agent.id, { 
          status: "FAILED",
          blockedReason: agent.error
        });
      }
      
      this.emit("failed", agent);
    }

    this.activeCount = Math.max(0, this.activeCount - 1);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.pendingQueue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.pendingQueue.shift();
      if (next) this.executeAgent(next.agent, next.config);
    }
  }

  private defaultExecutor = async (agent: SubAgent, config: SubAgentConfig): Promise<SubAgentResult> => {
    // Default: simulate task completion
    // In real usage, this should be replaced with forge pipeline execution
    const start = Date.now();
    return {
      success: true,
      output: `Sub-agent ${agent.label} completed task: ${config.task.slice(0, 100)}`,
      filesCreated: [],
      filesModified: [],
      tokensUsed: 0,
      thoughtCount: 0,
      duration: Date.now() - start,
    };
  };
}

// ─── TEAM TEMPLATES ──────────────────────────────────────────

/**
 * Create a full-stack team plan.
 * Divides work into frontend, backend, and tests.
 */
export function createFullStackTeam(task: string): TeamPlan {
  return {
    name: "fullstack",
    strategy: "parallel",
    agents: [
      {
        task: `Frontend: ${task}\nFocus on UI components, styling, and user interaction.`,
        label: "frontend",
        role: "frontend",
        priority: 1,
      },
      {
        task: `Backend: ${task}\nFocus on API endpoints, database models, and business logic.`,
        label: "backend",
        role: "backend",
        priority: 1,
      },
      {
        task: `Tests: ${task}\nWrite comprehensive tests for both frontend and backend.`,
        label: "tests",
        role: "testing",
        priority: 0,
      },
    ],
  };
}

/**
 * Create a research-then-build team plan.
 * First researches, then builds based on findings.
 */
export function createResearchBuildTeam(task: string): TeamPlan {
  return {
    name: "research-build",
    strategy: "pipeline",
    pipelineContext: true,
    agents: [
      {
        task: `Research: ${task}\nFind best practices, examples, and technical considerations.`,
        label: "researcher",
        role: "research",
      },
      {
        task: `Build: ${task}\nImplement based on research findings.`,
        label: "builder",
        role: "builder",
      },
      {
        task: `Review: ${task}\nReview the implementation for quality, security, and performance.`,
        label: "reviewer",
        role: "reviewer",
      },
    ],
  };
}
