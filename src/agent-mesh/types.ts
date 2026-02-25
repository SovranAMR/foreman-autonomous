/**
 * FOREMAN AGENT MESH — Core Types
 * 
 * Agent identity, state, communication, and coordination primitives.
 */

import type { ToolCall, ToolResult } from "../tools.js";

// ═════════════════════════════════════════════════════════════════════════════
// AGENT IDENTITY
// ═════════════════════════════════════════════════════════════════════════════

export type AgentRole = 
  | "VISIONER"      // Blueprint architect
  | "STRATEGIST"    // Coordinator
  | "RESEARCHER"    // Knowledge gatherer
  | "WORKER"        // Code implementer
  | "QA"            // Quality assurance
  | "ORCHESTRATOR"; // Master coordinator

export interface AgentCapabilities {
  tools: string[];
  maxTokensPerOperation: number;
  canSpawnSubAgents: boolean;
  canWriteToSharedMemory: boolean;
  preferredModel?: string;
}

export interface AgentConstraints {
  maxBudget: number;
  maxDurationMs: number;
  maxRetries: number;
  allowedPaths: string[];     // File system restrictions
  blockedPaths: string[];     // Security restrictions
}

export interface AgentManifest {
  id: string;
  role: AgentRole;
  parentId?: string;          // Who spawned this agent
  task: string;
  context: string;
  capabilities: AgentCapabilities;
  constraints: AgentConstraints;
  createdAt: Date;
  expectedOutput?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// AGENT STATE MACHINE
// ═════════════════════════════════════════════════════════════════════════════

export type AgentStatus = 
  | "REGISTERED"      // Just created
  | "INITIALIZING"    // Setting up
  | "ACTIVE"          // Ready for work
  | "BUSY"            // Currently working
  | "BLOCKED"         // Stuck, needs help
  | "RECOVERING"      // Attempting recovery
  | "COMPLETED"       // Successfully finished
  | "FAILED"          // Failed permanently
  | "TERMINATED";     // Killed by orchestrator

export interface AgentState {
  status: AgentStatus;
  progress: number;           // 0-100
  currentOperation?: string;
  currentTool?: string;
  lastToolCall?: ToolCall;
  lastToolResult?: ToolResult;
  healthScore: number;        // 0-100
  budgetUsed: number;
  budgetRemaining: number;
  tokensUsed: number;
  atomsCompleted: number;
  atomsFailed: number;
  lastHeartbeat: Date;
  startedAt?: Date;
  completedAt?: Date;
  blockedReason?: string;
  checkpointLocation?: string; // Git commit hash
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═════════════════════════════════════════════════════════════════════════════

export interface RegisteredAgent {
  manifest: AgentManifest;
  state: AgentState;
  output?: AgentOutput;
  metadata: AgentMetadata;
}

export interface AgentOutput {
  files: string[];
  summary: string;
  artifacts: Record<string, unknown>;
  metrics: OperationMetrics;
}

export interface AgentMetadata {
  spawnCount: number;         // How many times restarted
  recoveryAttempts: number;
  messagesReceived: number;
  messagesSent: number;
  handoffsGiven: number;
  handoffsReceived: number;
}

export interface OperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageOperationDuration: number;
  totalDuration: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMUNICATION
// ═════════════════════════════════════════════════════════════════════════════

export type EventType = 
  // Lifecycle
  | "agent.registered"
  | "agent.initialized"
  | "agent.started"
  | "agent.heartbeat"
  | "agent.blocked"
  | "agent.recovered"
  | "agent.completed"
  | "agent.failed"
  | "agent.terminated"
  // Work
  | "atom.started"
  | "atom.completed"
  | "atom.failed"
  | "atom.retry"
  // Coordination
  | "handoff.request"
  | "handoff.accepted"
  | "handoff.rejected"
  | "dependency.resolved"
  | "dependency.blocked"
  // Resources
  | "budget.warning"
  | "budget.exhausted"
  | "tool.unavailable"
  // Quality
  | "qa.micro.pass"
  | "qa.micro.fail"
  | "qa.checkpoint";

export interface AgentEvent {
  type: EventType;
  timestamp: Date;
  sourceAgentId: string;
  targetAgentId?: string;     // For direct messages
  payload: unknown;
  priority: EventPriority;
  id: string;                 // Unique event ID
}

export type EventPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface DirectMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  payload: unknown;
  timestamp: Date;
  acknowledged: boolean;
  retryCount: number;
}

export type MessageType = 
  | "CONTEXT_SHARE"
  | "HANDOFF_PACKAGE"
  | "QUERY"
  | "RESPONSE"
  | "COMMAND"
  | "SIGNAL";

// ═════════════════════════════════════════════════════════════════════════════
// SHARED STATE
// ═════════════════════════════════════════════════════════════════════════════

export interface SharedStateEntry {
  key: string;
  value: unknown;
  version: number;
  lastModified: Date;
  modifiedBy: string;
  subscribers: Set<string>;   // Agent IDs
}

export interface StateChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  version: number;
  changedBy: string;
  timestamp: Date;
}

// ═════════════════════════════════════════════════════════════════════════════
// COORDINATION
// ═════════════════════════════════════════════════════════════════════════════

export interface DependencyNode {
  agentId: string;
  dependencies: string[];     // Agent IDs that must complete first
  dependents: string[];       // Agent IDs waiting for this
  status: "pending" | "ready" | "running" | "completed" | "failed";
}

export interface HandoffPackage {
  fromAgentId: string;
  toAgentId: string;
  files: string[];
  interfaceContract: InterfaceContract;
  designContinuity: DesignContinuity;
  context: string;
  timestamp: Date;
}

export interface InterfaceContract {
  exportedSelectors: string[];
  exportedEvents: string[];
  zIndexRange: [number, number];
  cssVariables: Record<string, string>;
}

export interface DesignContinuity {
  colorPalette: Record<string, string>;
  animationTiming: string;
  typographyScale: string;
  spacingScale: string;
}

export interface Conflict {
  type: "Z_INDEX" | "TIMING" | "RESOURCE" | "STATE";
  between: [string, string];
  details: unknown;
  suggestedResolution?: unknown;
}

// ═════════════════════════════════════════════════════════════════════════════
// OBSERVABILITY
// ═════════════════════════════════════════════════════════════════════════════

export interface TraceSpan {
  id: string;
  parentId?: string;
  agentId: string;
  operation: string;
  startTime: Date;
  endTime?: Date;
  status: "running" | "completed" | "failed";
  events: TraceEvent[];
  metadata: Record<string, unknown>;
}

export interface TraceEvent {
  timestamp: Date;
  type: string;
  payload: unknown;
}

export interface HealthCheck {
  agentId: string;
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  tokensPerMinute: number;
  operationsPerMinute: number;
  errorRate: number;
  status: "healthy" | "degraded" | "unhealthy";
}

// ═════════════════════════════════════════════════════════════════════════════
// RECOVERY
// ═════════════════════════════════════════════════════════════════════════════

export interface Checkpoint {
  id: string;
  agentId: string;
  timestamp: Date;
  gitCommit: string;
  state: AgentState;
  files: string[];
  metadata: Record<string, unknown>;
}

export interface RecoveryPlan {
  failedAgentId: string;
  replacementAgentId: string;
  checkpoint: Checkpoint;
  resumeFrom: string;         // Operation ID or file position
  estimatedRecoveryTime: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// BUDGET
// ═════════════════════════════════════════════════════════════════════════════

export interface BudgetAllocation {
  agentId: string;
  total: number;
  used: number;
  remaining: number;
  roi: number;                // Return on investment (value/cost)
}

export interface BudgetWarning {
  agentId: string;
  remainingPercent: number;
  projectedExhaustion: Date;
  suggestedActions: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// MESH CONFIG
// ═════════════════════════════════════════════════════════════════════════════

export interface AgentMeshConfig {
  enableRegistry: boolean;
  enableCommunication: boolean;
  enableCoordination: boolean;
  enableObservability: boolean;
  enableRecovery: boolean;
  
  // Timing
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  checkpointInterval: number;
  
  // Limits
  maxConcurrentAgents: number;
  maxEventLogSize: number;
  maxMessageQueueSize: number;
  
  // Features
  enableAutomaticRecovery: boolean;
  enableConflictResolution: boolean;
  enableBudgetGovernor: boolean;
}

export const DEFAULT_MESH_CONFIG: AgentMeshConfig = {
  enableRegistry: true,
  enableCommunication: true,
  enableCoordination: true,
  enableObservability: true,
  enableRecovery: true,
  
  heartbeatIntervalMs: 30000,
  heartbeatTimeoutMs: 90000,
  checkpointInterval: 10,
  
  maxConcurrentAgents: 10,
  maxEventLogSize: 10000,
  maxMessageQueueSize: 1000,
  
  enableAutomaticRecovery: true,
  enableConflictResolution: true,
  enableBudgetGovernor: true
};
