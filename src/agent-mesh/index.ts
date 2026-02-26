/**
 * FOREMAN AGENT MESH
 * 
 * Next-generation multi-agent coordination system.
 * 
 * Phase 1: Agent Registry ✓ (Implemented)
 * Phase 2: Event Bus & Communication (Next)
 * Phase 3: Coordination & Handoff (Next)
 * Phase 4: Observability (Next)
 * Phase 5: Recovery (Next)
 */

// Core Types
export type {
  AgentManifest,
  AgentState,
  AgentStatus,
  AgentRole,
  RegisteredAgent,
  AgentOutput,
  AgentCapabilities,
  AgentConstraints,
  AgentEvent,
  EventType,
  EventPriority,
  DirectMessage,
  MessageType,
  SharedStateEntry,
  StateChange,
  DependencyNode,
  HandoffPackage,
  InterfaceContract,
  DesignContinuity,
  Conflict,
  TraceSpan,
  TraceEvent,
  HealthCheck,
  Checkpoint,
  RecoveryPlan,
  BudgetAllocation,
  BudgetWarning,
  AgentMeshConfig,
} from "./types.js";

export { DEFAULT_MESH_CONFIG } from "./types.js";

// Registry
export { AgentRegistry, getGlobalRegistry, resetGlobalRegistry } from "./agent-registry.js";
export type { RegistryEvents } from "./agent-registry.js";

// Version
export const AGENT_MESH_VERSION = "1.0.0-phase1";
