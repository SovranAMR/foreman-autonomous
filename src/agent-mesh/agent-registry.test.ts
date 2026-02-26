/**
 * Agent Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentRegistry } from "./agent-registry.js";
import type { AgentManifest, AgentRole } from "./types.js";

const createMockManifest = (id: string, role: AgentRole = "WORKER"): AgentManifest => ({
  id,
  role,
  task: "Test task",
  context: "",
  capabilities: {
    tools: ["read_file"],
    maxTokensPerOperation: 1000,
    canSpawnSubAgents: false,
    canWriteToSharedMemory: false
  },
  constraints: {
    maxBudget: 1000,
    maxDurationMs: 60000,
    maxRetries: 3,
    allowedPaths: ["./"],
    blockedPaths: []
  },
  createdAt: new Date()
});

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry({
      heartbeatIntervalMs: 1000,
      heartbeatTimeoutMs: 3000
    });
  });

  afterEach(() => {
    registry.cleanup();
  });

  describe("Registration", () => {
    it("should register a new agent", () => {
      const manifest = createMockManifest("agent-1");
      const agent = registry.register(manifest);

      expect(agent.manifest.id).toBe("agent-1");
      expect(agent.state.status).toBe("REGISTERED");
      expect(agent.state.healthScore).toBe(100);
    });

    it("should throw on duplicate registration", () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);

      expect(() => registry.register(manifest)).toThrow("already registered");
    });

    it("should support backward-compatible SubAgent registration", () => {
      const agent = registry.registerFromSubAgent(
        "sa-123",
        "Test task",
        "WORKER",
        "parent-1"
      );

      expect(agent.manifest.id).toBe("sa-123");
      expect(agent.manifest.parentId).toBe("parent-1");
      expect(agent.manifest.role).toBe("WORKER");
    });
  });

  describe("State Management", () => {
    it("should update agent state", () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);

      registry.updateState("agent-1", { 
        status: "ACTIVE",
        progress: 50 
      });

      const agent = registry.get("agent-1");
      expect(agent?.state.status).toBe("ACTIVE");
      expect(agent?.state.progress).toBe(50);
    });

    it("should emit state change events", () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);

      let eventFired = false;
      registry.on("agent.state.changed", (e) => {
        if (e.from === "REGISTERED" && e.to === "ACTIVE") {
          eventFired = true;
        }
      });

      registry.updateState("agent-1", { status: "ACTIVE" });
      expect(eventFired).toBe(true);
    });

    it("should detect blocked agents", () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);

      let blockedEvent: any = null;
      registry.on("agent.blocked", (e) => {
        blockedEvent = e;
      });

      registry.updateState("agent-1", { 
        status: "BLOCKED",
        blockedReason: "Stuck on tool execution"
      });

      expect(blockedEvent).not.toBeNull();
      expect(blockedEvent.reason).toBe("Stuck on tool execution");
    });
  });

  describe("Heartbeat", () => {
    it("should accept heartbeats", () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);

      let heartbeatEvent = false;
      registry.on("agent.heartbeat", () => {
        heartbeatEvent = true;
      });

      registry.heartbeat("agent-1", { progress: 75 });
      
      expect(heartbeatEvent).toBe(true);
      expect(registry.get("agent-1")?.state.progress).toBe(75);
    });

    it("should handle heartbeat timeout", async () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);
      registry.updateState("agent-1", { status: "ACTIVE" });

      let failedEvent: any = null;
      registry.on("agent.failed", (e) => {
        failedEvent = e;
      });

      // Wait for timeout (3 seconds in test config)
      await new Promise(r => setTimeout(r, 3500));

      expect(failedEvent).not.toBeNull();
      expect(failedEvent.error).toContain("Heartbeat timeout");
    });
  });

  describe("Queries", () => {
    beforeEach(() => {
      registry.register(createMockManifest("worker-1", "WORKER"));
      registry.register(createMockManifest("worker-2", "WORKER"));
      registry.register(createMockManifest("visioner-1", "VISIONER"));
      
      registry.updateState("worker-1", { status: "COMPLETED" });
      registry.updateState("worker-2", { status: "BUSY", healthScore: 80 });
      registry.updateState("visioner-1", { status: "BLOCKED", healthScore: 40 });
    });

    it("should filter by role", () => {
      const workers = registry.getByRole("WORKER");
      expect(workers).toHaveLength(2);
    });

    it("should filter by status", () => {
      const busy = registry.getByStatus("BUSY");
      expect(busy).toHaveLength(1);
      expect(busy[0].manifest.id).toBe("worker-2");
    });

    it("should get healthy agents", () => {
      const healthy = registry.getHealthy();
      expect(healthy).toHaveLength(1);
      expect(healthy[0].manifest.id).toBe("worker-2");
    });

    it("should calculate global metrics", () => {
      const metrics = registry.getGlobalMetrics();
      
      expect(metrics.totalAgents).toBe(3);
      expect(metrics.activeAgents).toBe(0); // COMPLETED and BLOCKED not active
      expect(metrics.failedAgents).toBe(1); // BLOCKED counts as failed state
      expect(metrics.averageHealth).toBe((100 + 80 + 40) / 3);
    });
  });

  describe("Lifecycle", () => {
    it("should terminate agents", () => {
      const manifest = createMockManifest("agent-1");
      registry.register(manifest);

      let terminatedEvent: any = null;
      registry.on("agent.terminated", (e) => {
        terminatedEvent = e;
      });

      registry.terminate("agent-1", "Test termination");

      expect(terminatedEvent.reason).toBe("Test termination");
      expect(registry.get("agent-1")?.state.status).toBe("TERMINATED");
    });
  });

  describe("Parent-Child Relationships", () => {
    it("should track parent-child relationships", () => {
      registry.register(createMockManifest("parent-1", "ORCHESTRATOR"));
      registry.register({
        ...createMockManifest("child-1", "WORKER"),
        parentId: "parent-1"
      });
      registry.register({
        ...createMockManifest("child-2", "WORKER"),
        parentId: "parent-1"
      });

      const children = registry.getChildren("parent-1");
      expect(children).toHaveLength(2);
      expect(children.map(c => c.manifest.id)).toContain("child-1");
      expect(children.map(c => c.manifest.id)).toContain("child-2");
    });
  });
});
