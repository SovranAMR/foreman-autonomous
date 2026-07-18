/**
 * FOREMAN — Core Type System
 *
 * This file defines Foreman's core data structures.
 * Every type is consistent with ARCHITECTURE.md.
 * Each addition corresponds to a thought file.
 */

// ─── LAYER (Katman) ───────────────────────────────────────────
// t_001

/**
 * Foreman's 4 thought layers.
 *
 * - visioner:    Soul, direction, aesthetics. "WHY does this exist?"
 * - strategist:  Decomposition, planning. "HOW should this be organized?"
 * - researcher:  Gathering information. "WHAT have others done?"
 * - worker:      Implementation + tactical reasoning. "What should I do HERE?"
 */
export type Layer = "visioner" | "strategist" | "researcher" | "worker";

/**
 * Operating rules for each layer.
 * Runtime'da override edilebilir — model isimleri default.
 */
export interface LayerConfig {
  /** Layer identifier */
  readonly layer: Layer;

  /** Tercih edilen LLM modeli (runtime'da override edilebilir) */
  defaultModel: string;

  /** Maximum number of thoughts per chain */
  maxThoughtsPerChain: number;

  /** Is research required in this layer */
  requiresResearch: boolean;

  /** Is verification required in this layer */
  requiresVerification: boolean;

  /** Can this layer block the parent layer (BLOCK signal) */
  canBlockParent: boolean;
}

/**
 * Default layer configurations.
 * Exactly consistent with LAYER_CONFIGS in ARCHITECTURE.md.
 */
export const DEFAULT_LAYER_CONFIGS: Readonly<Record<Layer, LayerConfig>> = {
  visioner: {
    layer: "visioner",
    defaultModel: "gemini-3.1-pro-high",
    maxThoughtsPerChain: 50,
    requiresResearch: true,
    requiresVerification: true,
    canBlockParent: false, // top layer
  },
  strategist: {
    layer: "strategist",
    defaultModel: "gemini-3.1-pro-high",
    maxThoughtsPerChain: 30,
    requiresResearch: true,
    requiresVerification: true,
    canBlockParent: true,
  },
  researcher: {
    layer: "researcher",
    defaultModel: "gemini-3.1-pro-high",
    maxThoughtsPerChain: 20,
    requiresResearch: true, // already the research layer
    requiresVerification: false,
    canBlockParent: true,
  },
  worker: {
    layer: "worker",
    defaultModel: "gemini-3.1-pro-high",
    maxThoughtsPerChain: 15,
    requiresResearch: false, // tactical thinking, no deep research
    requiresVerification: true, // build/test zorunlu
    canBlockParent: true,
  },
} as const;

// ─── THOUGHT STATUS ───────────────────────────────────────────
// t_002

/**
 * Lifecycle of a thought.
 *
 * Flow: pending → thinking → [researching] → executing → verifying → done
 * From any point → blocked is possible.
 * done → reverted is possible (rollback).
 *
 * "researching" is optional — thoughts not requiring research can skip it.
 */
export type ThoughtStatus =
  | "pending"      // created, not started
  | "thinking"     // reasoning in progress
  | "researching"  // research in progress
  | "executing"    // decided, being implemented
  | "verifying"    // implementation done, being verified
  | "done"         // completed
  | "blocked"      // cannot continue
  | "reverted";    // work was rolled back

/**
 * Verification method.
 * Each thought's output is verified with one of these methods.
 */
export type VerificationMethod =
  | "build"        // does `build` command pass
  | "test"         // do tests pass
  | "metric"       // FPS, lighthouse, bundle size vb.
  | "screenshot"   // visual verification
  | "logic";       // logical consistency (LLM self-check)

// ─── THOUGHT ──────────────────────────────────────────────────
// t_003

/**
 * The atomic unit of the system. Every vision, strategy, research, and code piece
 * is born as a Thought, reasoned about, implemented, and verified.
 *
 * Bir Thought asla muhakemesiz tamamlanamaz.
 * Bir Thought asla output'suz "done" olamaz.
 */
export interface Thought {
  /** Benzersiz kimlik: "t_001", "t_002", ... */
  readonly id: string;

  /** Hangi zincire ait: "chain_001_types" */
  readonly chainId: string;

  /** Which layer it operates in */
  readonly layer: Layer;

  // ── Input ──

  /** This thought's question / task */
  readonly input: string;

  /**
   * Dependencies / references.
   * Format: "t_001" (thought), "file:src/x.ts" (dosya), "url:..." (web)
   */
  readonly contextRefs: readonly string[];

  // ── Reasoning (REQUIRED) ──

  /**
   * WHY am I making this decision.
   * Empty string is not accepted at runtime — enforced.
   */
  reasoning: string;

  // ── Research (optional) ──

  /** Does this thought require research */
  needsResearch: boolean;

  /** Research query (filled if needsResearch=true) */
  researchQuery?: string;

  /** Research findings */
  researchFindings?: string;

  // ── Output ──

  /**
   * This thought's answer / result.
   * Cannot be empty in "done" state — enforced.
   */
  output: string;

  /** 0-1 confidence score. If low, the parent layer is notified. */
  confidence: number;

  // ── Verification ──

  /** Is verification required */
  needsVerification: boolean;

  /** Verification method */
  verificationMethod?: VerificationMethod;

  /** Verification result */
  verified?: boolean;

  /** Verification failure reason */
  verificationFailure?: string;

  // ── Flow ──

  /** Mevcut durum */
  status: ThoughtStatus;

  /** Next thought id (chain link) */
  next?: string;

  /** Neden durdu (status=blocked ise) */
  blockedReason?: string;

  /**
   * Worker thinking protocol.
   * Only filled in layer="worker" thoughts.
   * Runtime'da worker thought'u bu olmadan "done" olamaz.
   */
  workerProtocol?: WorkerProtocol;

  // ── Meta ──

  /** Creation time (ISO 8601) */
  readonly createdAt: string;

  /** Completion time (ISO 8601) */
  completedAt?: string;

  /** Tokens spent (for rate limit budget tracking) */
  tokenCost?: number;

  /** LLM model used */
  model?: string;
}

// ─── TASK SYSTEM ──────────────────────────────────────────────

/**
 * Task priority.
 * Used in pipeline sorting and task distribution.
 */
export type TaskPriority = "critical" | "high" | "medium" | "low";

/**
 * Task durumu.
 *
 * Flow: backlog → ready → in_progress → review → done
 * From any point → blocked is possible.
 * done → cancelled is possible.
 */
export type TaskStatus =
  | "backlog"       // defined but not yet planned
  | "ready"         // planned, dependencies met, ready to start
  | "in_progress"   // being worked on (chain active)
  | "review"        // completed, awaiting verification
  | "done"          // completed and verified
  | "blocked"       // dependency or BLOCK signal
  | "cancelled";    // iptal edildi

/**
 * Task type — determines what kind of work.
 */
export type TaskType =
  | "feature"       // new feature
  | "bug"           // bug fix
  | "research"      // research task
  | "design"        // design/aesthetics
  | "refactor"      // restructuring
  | "test"          // test yazma
  | "docs"          // documentation
  | "idea";         // building an idea from scratch

/**
 * Task — Unit of work.
 *
 * Below Project, above Thought.
 * A Task produces one or more Chains.
 * Subtasks are hierarchical under the parent task.
 *
 * Hierarchy: Project → Task (→ Subtask) → Chain → Thought
 */
export interface Task {
  /** Benzersiz kimlik: "task_001" */
  readonly id: string;

  /** Owning project */
  readonly projectId: string;

  /** Parent task (if subtask) */
  parentTaskId?: string;

  /** Task title — short and clear */
  title: string;

  /** Detailed description */
  description: string;

  /** Task type */
  type: TaskType;

  /** Priority */
  priority: TaskPriority;

  /** Mevcut durum */
  status: TaskStatus;

  /** Atanan katman (hangi katman lead alacak) */
  assignedLayer?: Layer;

  /**
   * Dependencies — other task IDs that must
   * be completed before this task can start.
   */
  dependsOn: string[];

  /**
   * Chain IDs produced from this task.
   * A task can produce multiple chains.
   */
  chainIds: string[];

  /**
   * Subtask IDs.
   * Subtasks are created when a task is decomposed.
   */
  subtaskIds: string[];

  /**
   * Tags — for filtering and grouping.
   * E.g.: ["hero", "mobile", "animation"]
   */
  tags: string[];

  /**
   * Tahmini effort (1-5 Fibonacci: 1=trivial, 2=small, 3=medium, 5=large, 8=epic)
   */
  effort?: number;

  /**
   * Acceptance criteria — when task is considered "done".
   */
  acceptanceCriteria: string[];

  /**
   * Neden bloke — status=blocked ise doldurulur.
   */
  blockedReason?: string;

  /** Creation time */
  readonly createdAt: string;

  /** Start time (when in_progress) */
  startedAt?: string;

  /** Completion time */
  completedAt?: string;

  /** Total token usage */
  totalTokens: number;

  /** Notes — human or visioner notes */
  notes: string[];
}

/**
 * Project — top-level organizational unit.
 *
 * A project contains multiple tasks.
 * Foreman focuses on one project at a time.
 */
export interface Project {
  /** Benzersiz kimlik: "proj_001" */
  readonly id: string;

  /** Project name */
  name: string;

  /** Project description */
  description: string;

  /** Vision summary (from visioner output) */
  vision?: string;

  /** Task IDs (top level, subtasks not included) */
  taskIds: string[];

  /** Proje durumu */
  status: "planning" | "active" | "paused" | "completed" | "archived";

  /** Creation time */
  readonly createdAt: string;

  /** Total token usage */
  totalTokens: number;
}

// ─── MEMORY & SESSION SYSTEM ──────────────────────────────────

/**
 * Memory entry — a piece of learned information.
 *
 * Foreman learns from previous work:
 * - Which approach worked/didn't work
 * - Proje-spesifik kararlar
 * - User preferences
 * - Technical constraints
 *
 * Memory, prompt context'e enjekte edilir —
 * to avoid making the same mistake twice.
 */
export interface MemoryEntry {
  /** Benzersiz kimlik */
  readonly id: string;

  /** Which project it belongs to ("global" for global memory) */
  projectId: string;

  /** Kategori */
  category: MemoryCategory;

  /** Content — learned information */
  content: string;

  /** Source — where it was learned from */
  source: MemorySource;

  /** Importance score (0-1). High = always enters context */
  importance: number;

  /** Related tags — for semantic search */
  tags: string[];

  /** How many times used (referenced) */
  useCount: number;

  /** Last usage time */
  lastUsedAt?: string;

  /** Creation time */
  readonly createdAt: string;

  /** Has it expired (soft delete) */
  expired: boolean;
}

export type MemoryCategory =
  | "decision"      // architectural/design decision
  | "preference"    // user preference ("no hover", "mobile-first")
  | "constraint"    // technical constraint ("no Three.js", "max 3 CSS anim")
  | "lesson"        // lesson learned ("Lenis flickers in Safari")
  | "pattern"       // working pattern ("Canvas2D > SVG for this case")
  | "context"       // project context ("Eyricedis = dental clinic, Bursa")
  | "error"         // mistake made and its solution
  | "reference";    // external source reference

export interface MemorySource {
  /** Kaynak tipi */
  type: "thought" | "user" | "research" | "reflection" | "manual";
  /** Kaynak ID (thought ID, vs.) */
  ref?: string;
}

/**
 * Session — work session.
 *
 * A session is the record of all work Foreman did in one sitting.
 * Cross-session memory: summaries of previous sessions
 * are provided as context to the new session.
 */
export interface Session {
  /** Benzersiz kimlik */
  readonly id: string;

  /** Proje ID */
  projectId: string;

  /** Start time */
  readonly startedAt: string;

  /** End time */
  endedAt?: string;

  /** Bu session'da tamamlanan task'lar */
  completedTaskIds: string[];

  /** Thoughts produced in this session */
  thoughtIds: string[];

  /** Memories created in this session */
  memoryIds: string[];

  /** Session summary (generated by LLM when session ends) */
  summary?: string;

  /** Total token usage */
  totalTokens: number;

  /** Session durumu */
  status: "active" | "completed" | "abandoned";
}

/**
 * Cache entry — LLM call cache.
 *
 * If the same prompt + model combination comes again
 * return from cache without making an LLM call.
 * Token savings + speed.
 */
export interface CacheEntry {
  /** Cache key (prompt hash) */
  readonly key: string;

  /** Model used */
  model: string;

  /** Katman */
  layer: Layer;

  /** LLM response (raw text) */
  response: string;

  /** Token usage */
  tokenUsage: { input: number; output: number; total: number };

  /** Creation time */
  readonly createdAt: string;

  /** Last access time */
  lastAccessedAt: string;

  /** Times used */
  hitCount: number;

  /** TTL — lifetime in milliseconds */
  ttlMs: number;
}

// ─── CHAIN ────────────────────────────────────────────────────
// t_004

/**
 * Chain durumu. Thought status'undan daha basit —
 * chain is the aggregation of individual thoughts.
 */
export type ChainStatus =
  | "active"       // running, thoughts being processed
  | "paused"       // paused (human intervention or waiting)
  | "completed"    // all thoughts done
  | "blocked";     // bir thought blocked, chain durdu

/**
 * Thought chain. Ordered sequence of thoughts aimed at the same goal.
 *
 * Chains can be hierarchical — a strategist chain
 * can spawn multiple worker sub-chains (fractal decomposition).
 */
export interface Chain {
  /** Benzersiz kimlik: "chain_001_types" */
  readonly id: string;

  /** Human-readable name: "Type System" */
  readonly name: string;

  /** This chain's purpose — single sentence */
  readonly goal: string;

  /** Dominant katman */
  readonly layer: Layer;

  /**
   * Parent chain id.
   * Fractal decomposition: when strategist atomizes a block,
   * it creates a sub-chain whose parent is the strategist chain.
   */
  readonly parentChainId?: string;

  /**
   * Thought id list (ordered).
   * Not the thought objects themselves, just id references.
   * Lazy loading — loaded from file when needed.
   */
  thoughts: string[];

  /** Mevcut durum */
  status: ChainStatus;

  /**
   * Accumulated summary of previous chains and this chain.
   * Context compression — token savings in long chains.
   * New thoughts use this summary as context.
   */
  contextSummary: string;

  /** Creation time (ISO 8601) */
  readonly createdAt: string;

  /** Completion time (ISO 8601) */
  completedAt?: string;
}

// ─── SYSTEM STATE ─────────────────────────────────────────────
// t_005

/**
 * Foreman's global state.
 * System is in exactly ONE state at any time — no nesting.
 */
export type SystemState =
  | "idle"             // doing nothing
  | "visioning"        // vision being created (visioner working)
  | "decomposing"      // decomposing (strategist working)
  | "researching"      // researching (researcher working)
  | "atomizing"        // block being atomized (strategist working)
  | "executing"        // atom being executed (worker working)
  | "verifying"        // kontrol ediliyor
  | "reflecting"       // reviewing (consistency check)
  | "blocked"          // problem var, devam edilemiyor
  | "awaiting_human"   // waiting for human approval
  | "complete";        // all work done

/**
 * Valid state transitions.
 * A transition not defined here is REJECTED at runtime.
 *
 * No dead states — every state has at least one exit.
 * "complete" can only return to "idle" (for new work).
 */
export const VALID_TRANSITIONS: Readonly<Record<SystemState, readonly SystemState[]>> = {
  idle:            ["visioning"],
  visioning:       ["decomposing", "blocked"],
  decomposing:     ["researching", "executing", "atomizing", "blocked"],
  researching:     ["decomposing", "executing", "atomizing", "blocked"],
  atomizing:       ["executing", "blocked"],
  executing:       ["verifying", "atomizing", "blocked"],
  verifying:       ["executing", "reflecting", "blocked", "complete"],
  reflecting:      ["executing", "decomposing", "atomizing", "visioning", "blocked"],
  blocked:         ["decomposing", "atomizing", "visioning", "awaiting_human"],
  awaiting_human:  ["executing", "decomposing", "atomizing", "visioning", "idle"],
  complete:        ["idle"],
} as const;

// ─── WORKER PROTOCOL ──────────────────────────────────────────
// t_006

/**
 * Worker's mandatory thinking steps for each atom.
 *
 * This protocol prevents the worker from writing code blindly.
 * Each step is a string — empty string is REJECTED at runtime.
 *
 * Flow:
 *   BEFORE: read → context → impact → decide → predict
 *   DO:     execute
 *   AFTER:  verify → report
 */
export interface WorkerProtocol {
  // ── BEFORE doing ──

  /** Read target file, find relevant lines */
  step1_read: string;

  /** Understand existing code — what exists, what's missing, what's connected */
  step2_context: string;

  /** What does this change affect? Any side effects? */
  step3_impact: string;

  /** Exactly what I will write, where I will write it */
  step4_decide: string;

  /** How screen/behavior will look after this change */
  step5_predict: string;

  // ── Yapma ──

  /** Summary of the applied change */
  step6_execute: string;

  // ── AFTER doing ──

  /** Does build work? Were my expectations met? */
  step7_verify: string;

  /** What I did, what changed, anything unexpected */
  step8_report: string;
}

// ─── RATE LIMITING ────────────────────────────────────────────
// t_007

/**
 * Model rotation — to avoid overloading a single provider.
 * Switches to next model from fallback list on 429.
 */
export interface ModelRotation {
  /** Ana model */
  primary: string;

  /** Backup models (ordered) */
  fallback: readonly string[];

  /** 429 gelince otomatik rotate et */
  rotateOn429: boolean;
}

/**
 * Token budget — prevents uncontrolled spending.
 * When exceeded, thought becomes "blocked", reason: "budget_exceeded".
 */
export interface TokenBudget {
  /** Max token usage for a single thought */
  perThought: number;

  /** Max token usage for a single chain */
  perChain: number;

  /** Max token usage for the entire session */
  perSession: number;
}

/**
 * Rate limit configuration.
 * Throttle + model rotation + token budget.
 */
export interface RateLimitConfig {
  /** Minimum delay between calls (ms) */
  minDelayBetweenCalls: number;

  /** Max calls per minute (burst protection) */
  maxCallsPerMinute: number;

  /** Wait time after burst (ms) */
  cooldownAfterBurst: number;

  /** Wait strategy after 429 */
  backoffStrategy: "exponential";

  /** Maximum retry count */
  maxRetries: number;

  /** Model rotation rules */
  modelRotation: ModelRotation;

  /** Token budget */
  budget: TokenBudget;
}

// ─── PERSISTENCE / STATE ──────────────────────────────────────
// t_008

/**
 * Record of a state transition.
 * Audit trail — ne zaman, nereden nereye, neden.
 */
export interface StateTransition {
  /** Previous state */
  from: SystemState;

  /** Sonraki durum */
  to: SystemState;

  /** Transition reason */
  reason: string;

  /** Transition time (ISO 8601) */
  at: string;

  /** Related thought id (if any) */
  thoughtId?: string;

  /** Related chain id (if any) */
  chainId?: string;
}

/**
 * Foreman's global runtime state.
 * state.json olarak persist edilir.
 * File read first in each session, updated on each transition.
 */
export interface ForemanState {
  /** Mevcut sistem durumu */
  currentState: SystemState;

  /** Currently active chain (if any) */
  activeChainId?: string;

  /** Currently active thought (if any) */
  activeThoughtId?: string;

  /** Project root directory */
  projectRoot: string;

  /** Project name */
  projectName: string;

  /** Last N transitions (audit trail) */
  history: StateTransition[];

  /** Total tokens spent (per session) */
  totalTokens: number;

  /** Session start time */
  sessionStartedAt: string;

  /** Last update time */
  lastUpdatedAt: string;

  /**
   * Atoms that failed permanently during the main pipeline run (after
   * full retry + rescue attempts). Populated by the orchestrator and
   * processed in the end-of-pipeline RECOVERY phase (Katman 3).
   */
  recoveryQueue?: FailedAtom[];
}

/**
 * A permanently-failed atom — carries enough context so the
 * end-of-pipeline RECOVERY phase can decide whether to re-batch it.
 */
export interface FailedAtom {
  /** Human-readable atom description. */
  atom: string;
  /** Source block index (0-based) where this atom originated. */
  blockIndex: number;
  /** Atom index within its source block (0-based). */
  atomIndex: number;
  /** Short reason the atom could not be completed. */
  reason: string;
  /** Origin: primary retry loop, rescue mini-split, or re_decompose. */
  stage: "primary" | "rescue" | "re_decompose";
  /** ISO timestamp when this failure was recorded. */
  at: string;
}

// ─── ENGINE TYPES ─────────────────────────────────────────────
// t_009

/**
 * "Think" command to the engine.
 */
export interface ThinkRequest {
  /** What to think about */
  input: string;

  /** Which layer to think in */
  layer: Layer;

  /** Context references */
  contextRefs: string[];

  /** Context text (compiled from previous thoughts) */
  contextText?: string;

  /** Constraints */
  constraints?: {
    maxTokens?: number;
    timeoutMs?: number;
    model?: string; // override default model
  };
}

/**
 * Engine's thought output.
 */
export interface ThinkResult {
  /** Reasoning (why I reached this conclusion) */
  reasoning: string;

  /** Result */
  output: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Is research needed */
  needsResearch: boolean;

  /** Research query (if needsResearch=true) */
  researchQuery?: string;

  /** Suggested next step */
  suggestedNext?: string;

  /** Harcanan token */
  tokenCost: number;

  /** Model used */
  model: string;
}

/**
 * Research result.
 */
export interface ResearchResult {
  /** Research query */
  query: string;

  /** Bulunan kaynaklar */
  sources: readonly ResearchSource[];

  /** Synthesized findings */
  findings: string;

  /** Ne kadar ilgili bulgu bulundu (0-1) */
  relevanceScore: number;

  /** Harcanan token */
  tokenCost: number;
}

/**
 * A single research source.
 */
export interface ResearchSource {
  /** Kaynak URL'i veya dosya yolu */
  ref: string;

  /** Source title */
  title: string;

  /** Summary of the relevant part */
  snippet: string;
}

/**
 * Kod uygulama sonucu.
 */
export interface ExecuteResult {
  /** Was it successful */
  success: boolean;

  /** Changed files */
  filesChanged: readonly string[];

  /** Did build pass (null = build was not run) */
  buildPassed: boolean | null;

  /** Error message (if success=false) */
  error?: string;

  /** Commit hash (if commit was made) */
  commitHash?: string;
}
