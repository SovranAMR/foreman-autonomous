/**
 * FOREMAN AGENT REGISTRY
 * 
 * Central agent lifecycle management, identity, and health monitoring.
 * Backward compatible with existing SubAgent system.
 */

import { EventEmitter } from "node:events";
import type { 
  AgentManifest, 
  AgentState, 
  RegisteredAgent, 
  AgentStatus,
  HealthCheck,
  AgentOutput,
  AgentRole
} from "./types.js";

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRY EVENTS
// ═════════════════════════════════════════════════════════════════════════════

export interface RegistryEvents {
  "agent.registered": { agentId: string; manifest: AgentManifest };
  "agent.state.changed": { agentId: string; from: AgentStatus; to: AgentStatus };
  "agent.heartbeat": { agentId: string; timestamp: Date };
  "agent.blocked": { agentId: string; reason: string };
  "agent.recovered": { agentId: string; fromFailure: string };
  "agent.completed": { agentId: string; output: AgentOutput };
  "agent.failed": { agentId: string; error: string };
  "agent.terminated": { agentId: string; reason: string };
  "health.degraded": { agentId: string; score: number };
  "health.critical": { agentId: string; score: number };
}

// ═════════════════════════════════════════════════════════════════════════════
// AGENT REGISTRY
// ═════════════════════════════════════════════════════════════════════════════

export class AgentRegistry extends EventEmitter {
  private agents = new Map<string, RegisteredAgent>();
  private healthChecks = new Map<string, HealthCheck[]>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  
  // Configuration
  private readonly heartbeatInterval: number;
  private readonly heartbeatTimeout: number;
  private readonly maxHealthHistory: number = 100;

  constructor(options: { 
    heartbeatIntervalMs?: number; 
    heartbeatTimeoutMs?: number;
  } = {}) {
    super();
    this.heartbeatInterval = options.heartbeatIntervalMs ?? 30000;
    this.heartbeatTimeout = options.heartbeatTimeoutMs ?? 90000;
  }

  // ─── REGISTRATION ─────────────────────────────────────────────────────────

  /**
   * Register a new agent in the mesh.
   * Backward compatible: can wrap existing SubAgent.
   */
  register(manifest: AgentManifest): RegisteredAgent {
    if (this.agents.has(manifest.id)) {
      throw new Error(`Agent ${manifest.id} already registered`);
    }

    const agent: RegisteredAgent = {
      manifest,
      state: this.createInitialState(manifest),
      metadata: {
        spawnCount: 1,
        recoveryAttempts: 0,
        messagesReceived: 0,
        messagesSent: 0,
        handoffsGiven: 0,
        handoffsReceived: 0
      }
    };

    this.agents.set(manifest.id, agent);
    this.startHeartbeatMonitoring(manifest.id);
    
    this.emit("agent.registered", { agentId: manifest.id, manifest });
    
    return agent;
  }

  /**
   * Register from existing SubAgent (backward compatibility)
   */
  registerFromSubAgent(
    subAgentId: string,
    task: string,
    role: AgentRole = "WORKER",
    parentId?: string
  ): RegisteredAgent {
    const manifest: AgentManifest = {
      id: subAgentId,
      role,
      parentId,
      task,
      context: "",
      capabilities: {
        tools: ["read_file", "write_file", "edit_file", "bash"],
        maxTokensPerOperation: 8000,
        canSpawnSubAgents: false,
        canWriteToSharedMemory: false
      },
      constraints: {
        maxBudget: 100000,
        maxDurationMs: 300000,
        maxRetries: 3,
        allowedPaths: ["./"],
        blockedPaths: []
      },
      createdAt: new Date()
    };

    return this.register(manifest);
  }

  // ─── STATE MANAGEMENT ─────────────────────────────────────────────────────

  private createInitialState(manifest: AgentManifest): AgentState {
    return {
      status: "REGISTERED",
      progress: 0,
      healthScore: 100,
      budgetUsed: 0,
      budgetRemaining: manifest.constraints.maxBudget,
      tokensUsed: 0,
      atomsCompleted: 0,
      atomsFailed: 0,
      lastHeartbeat: new Date()
    };
  }

  updateState(agentId: string, updates: Partial<AgentState>): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const oldStatus = agent.state.status;
    const newStatus = updates.status ?? oldStatus;

    // Update state
    agent.state = { ...agent.state, ...updates, lastHeartbeat: new Date() };

    // Emit status change event
    if (oldStatus !== newStatus) {
      this.emit("agent.state.changed", { agentId, from: oldStatus, to: newStatus });
      
      // Handle specific state transitions
      this.handleStateTransition(agentId, oldStatus, newStatus);
    }

    // Check health score
    if (agent.state.healthScore < 50 && oldStatus !== "BLOCKED") {
      this.emit("health.critical", { agentId, score: agent.state.healthScore });
    } else if (agent.state.healthScore < 70) {
      this.emit("health.degraded", { agentId, score: agent.state.healthScore });
    }
  }

  private handleStateTransition(
    agentId: string, 
    from: AgentStatus, 
    to: AgentStatus
  ): void {
    switch (to) {
      case "ACTIVE":
        if (from === "REGISTERED") {
          this.emit("agent.initialized", { agentId });
        }
        break;
      case "BUSY":
        // Start operation timer
        break;
      case "BLOCKED":
        const agent = this.agents.get(agentId);
        this.emit("agent.blocked", { 
          agentId, 
          reason: agent?.state.blockedReason || "Unknown" 
        });
        break;
      case "COMPLETED":
        this.stopHeartbeatMonitoring(agentId);
        break;
      case "FAILED":
        this.stopHeartbeatMonitoring(agentId);
        break;
    }
  }

  // ─── HEARTBEAT MONITORING ─────────────────────────────────────────────────

  heartbeat(agentId: string, healthUpdate?: Partial<AgentState>): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`Heartbeat from unknown agent: ${agentId}`);
      return;
    }

    // Update state
    this.updateState(agentId, {
      lastHeartbeat: new Date(),
      ...healthUpdate
    });

    // Record health check
    this.recordHealthCheck(agentId);

    this.emit("agent.heartbeat", { agentId, timestamp: new Date() });
  }

  private startHeartbeatMonitoring(agentId: string): void {
    // Check heartbeat timeout periodically
    const timer = setInterval(() => {
      this.checkHeartbeatTimeout(agentId);
    }, this.heartbeatInterval);

    this.heartbeatTimers.set(agentId, timer);
  }

  private stopHeartbeatMonitoring(agentId: string): void {
    const timer = this.heartbeatTimers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(agentId);
    }
  }

  private checkHeartbeatTimeout(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const timeSinceLastHeartbeat = Date.now() - agent.state.lastHeartbeat.getTime();
    
    if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
      // Agent is unresponsive
      console.error(`Agent ${agentId} heartbeat timeout (${timeSinceLastHeartbeat}ms)`);
      this.updateState(agentId, { 
        status: "FAILED",
        blockedReason: "Heartbeat timeout"
      });
      this.emit("agent.failed", { 
        agentId, 
        error: `Heartbeat timeout after ${timeSinceLastHeartbeat}ms` 
      });
    }
  }

  private recordHealthCheck(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const health: HealthCheck = {
      agentId,
      timestamp: new Date(),
      cpuUsage: 0, // Would need OS metrics
      memoryUsage: 0,
      tokensPerMinute: this.calculateTokensPerMinute(agentId),
      operationsPerMinute: this.calculateOperationsPerMinute(agentId),
      errorRate: agent.state.atomsFailed / Math.max(1, agent.state.atomsCompleted + agent.state.atomsFailed),
      status: this.determineHealthStatus(agent)
    };

    let checks = this.healthChecks.get(agentId) || [];
    checks.push(health);
    
    // Keep only recent history
    if (checks.length > this.maxHealthHistory) {
      checks = checks.slice(-this.maxHealthHistory);
    }
    
    this.healthChecks.set(agentId, checks);
  }

  private calculateTokensPerMinute(agentId: string): number {
    const checks = this.healthChecks.get(agentId) || [];
    if (checks.length < 2) return 0;
    
    const recent = checks.slice(-10);
    // Simplified calculation
    return 0;
  }

  private calculateOperationsPerMinute(agentId: string): number {
    const checks = this.healthChecks.get(agentId) || [];
    if (checks.length < 2) return 0;
    return 0;
  }

  private determineHealthStatus(agent: RegisteredAgent): "healthy" | "degraded" | "unhealthy" {
    if (agent.state.healthScore >= 80) return "healthy";
    if (agent.state.healthScore >= 50) return "degraded";
    return "unhealthy";
  }

  // ─── QUERIES ──────────────────────────────────────────────────────────────

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  getAll(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  getByRole(role: AgentRole): RegisteredAgent[] {
    return this.getAll().filter(a => a.manifest.role === role);
  }

  getByStatus(status: AgentStatus): RegisteredAgent[] {
    return this.getAll().filter(a => a.state.status === status);
  }

  getActive(): RegisteredAgent[] {
    return this.getAll().filter(a => 
      ["ACTIVE", "BUSY", "INITIALIZING"].includes(a.state.status)
    );
  }

  getHealthy(): RegisteredAgent[] {
    return this.getAll().filter(a => a.state.healthScore >= 70);
  }

  getBlocked(): RegisteredAgent[] {
    return this.getByStatus("BLOCKED");
  }

  getChildren(parentId: string): RegisteredAgent[] {
    return this.getAll().filter(a => a.manifest.parentId === parentId);
  }

  // ─── METRICS ──────────────────────────────────────────────────────────────

  getGlobalMetrics() {
    const all = this.getAll();
    return {
      totalAgents: all.length,
      activeAgents: this.getActive().length,
      completedAgents: this.getByStatus("COMPLETED").length,
      failedAgents: this.getByStatus("FAILED").length,
      blockedAgents: this.getBlocked().length,
      averageHealth: all.reduce((sum, a) => sum + a.state.healthScore, 0) / Math.max(1, all.length),
      totalTokensUsed: all.reduce((sum, a) => sum + a.state.tokensUsed, 0),
      totalBudgetUsed: all.reduce((sum, a) => sum + a.state.budgetUsed, 0)
    };
  }

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────

  terminate(agentId: string, reason: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.stopHeartbeatMonitoring(agentId);
    this.updateState(agentId, { status: "TERMINATED" });
    this.emit("agent.terminated", { agentId, reason });
  }

  cleanup(): void {
    // Stop all heartbeat timers
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();
    this.agents.clear();
    this.healthChecks.clear();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═════════════════════════════════════════════════════════════════════════════

let globalRegistry: AgentRegistry | null = null;

export function getGlobalRegistry(): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry();
  }
  return globalRegistry;
}

export function resetGlobalRegistry(): void {
  if (globalRegistry) {
    globalRegistry.cleanup();
    globalRegistry = null;
  }
}
