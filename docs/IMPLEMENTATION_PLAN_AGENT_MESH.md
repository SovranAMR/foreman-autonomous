# FOREMAN AGENT MESH — Implementation Plan

## Mevcut Durum Analizi

### Mevcut Mimari (src/)
```
orchestrator.ts (102KB)     → Ana pipeline (Visioner → Strategist → Researcher → Worker)
execution-engine.ts (33KB)  → Tool execution layer  
subagent-engine.ts (14KB)   → Sub-agent spawn/management
pipeline-observer.ts (25KB) → Monitoring
```

### Hedef Mimari (Agent Mesh)
```
agent-mesh/
├── agent-registry.ts       → Agent identity, lifecycle, heartbeat
├── agent-communication.ts  → Event bus, direct messaging, shared state
├── agent-coordination.ts   → Handoff protocol, conflict resolution
├── agent-observability.ts  → Distributed tracing, metrics, dashboard
└── agent-recovery.ts       → Failure detection, checkpoint, replacement
```

## Faz 1: Foundation (Week 1) — AGENT REGISTRY

### 1.1 Agent Identity System
**Dosya:** `src/agent-mesh/agent-registry.ts` (Yeni)
- Agent manifest tanımı
- Role-based capabilities (Visioner, Worker, etc.)
- Health status tracking
- Heartbeat protocol (30s interval)

**Mevcut Entegrasyon:**
- `SubAgent` interface'i genişletilecek
- `SubAgentEngine`'e registry eklenecek
- Backward compatible (mevcut sub-agent'lar çalışmaya devam)

### 1.2 Agent State Machine
```typescript
Status: "REGISTERED" → "INITIALIZING" → "ACTIVE" → "BUSY" → "COMPLETED" | "FAILED"
               ↓
         "BLOCKED" (recovery attempt) → "RECOVERING" → "ACTIVE"
```

### 1.3 Checkpoint System
- Her 10 operation'da git commit
- State serialization
- Resume capability (mevcut PipelineResumeEngine ile entegre)

## Faz 2: Communication Layer (Week 2) — EVENT BUS

### 2.1 Event Bus Implementation
**Dosya:** `src/agent-mesh/event-bus.ts` (Yeni)
- Pub/Sub pattern
- Event types: atom.completed, agent.blocked, handoff.request, etc.
- Persistent event log (append-only)

### 2.2 Direct Messaging
**Dosya:** `src/agent-mesh/direct-messaging.ts` (Yeni)
- Point-to-point message queue
- Priority levels (CRITICAL, HIGH, NORMAL, LOW)
- Acknowledgment & retry

### 2.3 Shared State Store
**Dosya:** `src/agent-mesh/shared-state.ts` (Yeni)
- Key-value store (Redis-like, in-memory)
- Reactive subscriptions (state change → callback)
- Design tokens, scroll state, color palette gibi global state

### 2.4 Mevcut Entegrasyon
```typescript
// orchestrator.ts içinde
this.agentMesh = new AgentMesh();
this.agentMesh.on('atom.completed', (event) => {
  this.checkDependencies(event.atomId);
});
```

## Faz 3: Coordination Layer (Week 3) — HANDOFF PROTOCOL

### 3.1 Handoff Manager
**Dosya:** `src/agent-mesh/handoff-manager.ts` (Yeni)
- Context package oluşturma
- Interface contract verification
- Visual handoff animation coordination

### 3.2 Dependency Resolver
**Dosya:** `src/agent-mesh/dependency-resolver.ts` (Yeni)
- DAG (Directed Acyclic Graph) oluşturma
- Critical path detection
- Parallelization optimization

### 3.3 Conflict Resolution
**Dosya:** `src/agent-mesh/conflict-resolver.ts` (Yeni)
- Z-index collision detection
- Timing inconsistency resolution
- Resource contention arbitration

### 3.4 Mevcut Entegrasyon
- `SubAgentEngine.executeTeam()` metodu güncellenecek
- Agent'lar arası handoff otomatikleştirilecek

## Faz 4: Observability (Week 4) — MONITORING

### 4.1 Distributed Tracing
**Dosya:** `src/agent-mesh/tracing.ts` (Yeni)
- OpenTelemetry benzeri tracing
- Span tree (parent-child relationship)
- Performance metrics per agent

### 4.2 Real-time Dashboard
**Dosya:** `src/agent-mesh/dashboard.ts` (Yeni)
- WebSocket-based live updates
- Agent health cards
- System metrics (budget, progress, blocked agents)

### 4.3 Log Aggregation
- Structured logging (JSON)
- Centralized log collection
- Search & filter capabilities

## Faz 5: Recovery & Resilience (Week 5) — SELF-HEALING

### 5.1 Failure Detection
**Dosya:** `src/agent-mesh/health-monitor.ts` (Yeni)
- Heartbeat timeout detection
- Anomaly detection (performance degradation)
- Circuit breaker pattern

### 5.2 Recovery Engine
**Dosya:** `src/agent-mesh/recovery-engine.ts` (Yeni)
- Checkpoint restore
- Agent replacement (spawn new agent with same context)
- State reconstruction

### 5.3 Budget Governor
**Dosya:** `src/agent-mesh/budget-governor.ts` (Yeni)
- Per-agent budget allocation
- ROI calculation per operation
- Early termination for low-value operations

## Faz 6: Integration & Migration (Week 6)

### 6.1 Orchestrator Integration
```typescript
// orchestrator.ts diff
+ import { AgentMesh } from "./agent-mesh/index.js";

  constructor(engine: Engine) {
    this.engine = engine;
    this.resume = new PipelineResumeEngine(...);
    this.observer = new PipelineObserver(...);
+   this.agentMesh = new AgentMesh({
+     enableRegistry: true,
+     enableCommunication: true,
+     enableCoordination: true,
+     enableObservability: true,
+     enableRecovery: true
+   });
  }
```

### 6.2 Feature Flags
```typescript
const AGENT_MESH_FEATURES = {
  REGISTRY: process.env.FM_ENABLE_REGISTRY === "true",
  COMMUNICATION: process.env.FM_ENABLE_COMMUNICATION === "true",
  COORDINATION: process.env.FM_ENABLE_COORDINATION === "true",
  OBSERVABILITY: process.env.FM_ENABLE_OBSERVABILITY === "true",
  RECOVERY: process.env.FM_ENABLE_RECOVERY === "true"
};
```

### 6.3 Gradual Rollout
1. **Week 6:** Internal testing (registry + basic communication)
2. **Week 7:** Beta (coordination + observability)
3. **Week 8:** GA (recovery + full mesh)

## Pixel-Pixel Implementation Details

### Step 1: Type Definitions (Day 1)
```typescript
// src/agent-mesh/types.ts
export interface AgentManifest {
  id: string;
  role: AgentRole;
  capabilities: Tool[];
  constraints: Constraint[];
  budget: BudgetAllocation;
}

export interface AgentState {
  status: AgentStatus;
  progress: number;
  currentOperation: string;
  healthScore: number;
  lastHeartbeat: Date;
}
```

### Step 2: Registry Core (Day 2-3)
```typescript
// src/agent-mesh/agent-registry.ts
export class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>();
  
  register(manifest: AgentManifest): void {
    // Implementation
  }
  
  heartbeat(agentId: string): void {
    // Update last seen
  }
  
  getHealthyAgents(): RegisteredAgent[] {
    // Filter by health score
  }
}
```

### Step 3: Event Bus Core (Day 4-5)
```typescript
// src/agent-mesh/event-bus.ts
export class AgentEventBus {
  private subscribers = new Map<string, Set<EventHandler>>();
  private eventLog: AgentEvent[] = [];
  
  emit(event: AgentEvent): void {
    // Persist to log
    // Notify subscribers
  }
  
  subscribe(eventType: string, handler: EventHandler): void {
    // Add to subscribers
  }
}
```

### Step 4: Integration Points (Day 6-7)
- `orchestrator.ts` → AgentMesh injection
- `subagent-engine.ts` → Registry integration
- `execution-engine.ts` → Event emission

## Risk Mitigation

### Risk 1: Breaking Changes
**Mitigation:** Feature flags, gradual rollout, extensive testing

### Risk 2: Performance Overhead
**Mitigation:** Benchmark before/after, optimize hot paths

### Risk 3: Complexity Increase
**Mitigation:** Clear documentation, debugging tools, monitoring

## Acceptance Criteria

- [ ] Tüm mevcut test'ler geçiyor (backward compatibility)
- [ ] Yeni Agent Mesh test'leri geçiyor
- [ ] Epic task (200KB dosya) başarıyla tamamlanıyor
- [ ] Agent'lar birbirini görüyor (heartbeat)
- [ ] Handoff protokolü çalışıyor
- [ ] Failure recovery otomatik
- [ ] Observability dashboard canlı

## Sonraki Adımlar

1. **Faz 1'e başla:** `agent-registry.ts` implementasyonu
2. **Test yaz:** Unit test'ler her modül için
3. **Entegrasyon testleri:** Tam pipeline test'leri
4. **Dokümantasyon:** API docs, usage examples

---
**Hazır mısın? Faz 1'e başlıyoruz.** 🚀
