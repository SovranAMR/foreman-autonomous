/**
 * FOREMAN — Pipeline Observer
 *
 * Full observability for forge pipeline:
 * - Every phase, block, atom tracked with timing
 * - Every worker input/output captured
 * - Every tool call logged
 * - Live Telegram streaming (optional)
 * - JSONL log file for post-mortem analysis
 * - Human-readable summary generation
 *
 * Usage:
 *   const observer = new PipelineObserver(projectRoot);
 *   orchestrator.on(event => observer.onEvent(event));
 *   // After pipeline:
 *   observer.getSummary()      // human-readable
 *   observer.getTimeline()     // chronological events
 *   observer.getAtomDetails()  // per-atom breakdown
 */

import { writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { OrchestratorEvent } from "./orchestrator.js";
import type { StreamEvent } from "./streaming-pipeline.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ObserverEvent {
  id: number;
  timestamp: number;
  elapsed: number; // ms since pipeline start
  category: ObserverCategory;
  type: string;
  phase?: string;
  blockIndex?: number;
  atomIndex?: number;
  detail: string;
  data?: Record<string, unknown>;
}

export type ObserverCategory =
  | "pipeline"
  | "phase"
  | "block"
  | "atom"
  | "worker"
  | "tool"
  | "review"
  | "error"
  | "system"
  | "guard";

export interface AtomRecord {
  blockIndex: number;
  atomIndex: number;
  description: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attempts: number;
  status: "running" | "passed" | "failed" | "skipped";
  workerInput?: string;
  workerOutput?: string;
  toolCalls: ToolCallRecord[];
  operations: OperationRecord[];
  confidence?: number;
  tokenCost?: number;
  rejectionFeedback?: string;
  reviewResult?: string;
}

export interface ToolCallRecord {
  name: string;
  args: string;
  result?: string;
  success?: boolean;
  timestamp: number;
  durationMs?: number;
}

export interface OperationRecord {
  type: string;
  path?: string;
  command?: string;
  success: boolean;
  detail?: string;
}

export interface BlockRecord {
  index: number;
  description: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  totalAtoms: number;
  passedAtoms: number;
  failedAtoms: number;
  skippedAtoms: number;
  atoms: AtomRecord[];
}

export interface PipelineSummary {
  task: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  durationStr: string;
  success: boolean;
  totalBlocks: number;
  totalAtoms: number;
  passedAtoms: number;
  failedAtoms: number;
  totalToolCalls: number;
  totalHallucinations: number;
  totalTokens: number;
  totalCost: number;
  phases: PhaseRecord[];
  blocks: BlockRecord[];
  errors: string[];
  warnings: string[];
}

export interface PhaseRecord {
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  detail?: string;
}

// ─── OBSERVER ────────────────────────────────────────────────

export class PipelineObserver {
  private events: ObserverEvent[] = [];
  private blocks: BlockRecord[] = [];
  private phases: PhaseRecord[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];
  private hallucinations: string[] = [];
  private eventCounter = 0;
  private pipelineStartTime = 0;
  private task = "";
  private logPath: string;
  private logDir: string;
  private totalCost = 0;

  // Current state tracking
  private currentBlock: BlockRecord | null = null;
  private currentAtom: AtomRecord | null = null;
  private currentPhase: PhaseRecord | null = null;
  private currentToolCall: ToolCallRecord | null = null;

  // Telegram live streaming
  private telegramCallback: ((text: string) => Promise<void>) | null = null;
  private lastTelegramUpdate = 0;
  private telegramThrottleMs = 2000; // min 2s between updates

  constructor(projectRoot: string) {
    this.logDir = join(projectRoot, ".foreman", "observer");
    if (!existsSync(this.logDir)) mkdirSync(this.logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.logPath = join(this.logDir, `pipeline-${timestamp}.jsonl`);
  }

  /**
   * Enable live Telegram streaming.
   * Callback receives formatted status updates.
   */
  enableTelegram(callback: (text: string) => Promise<void>, throttleMs = 2000): void {
    this.telegramCallback = callback;
    this.telegramThrottleMs = throttleMs;
  }

  /** Set total cost (called by CostTracker). */
  setTotalCost(cost: number): void {
    this.totalCost = cost;
  }

  // ─── ORCHESTRATOR EVENT HANDLER ─────────────────────────

  onOrchestratorEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case "phase_start":
        this.onPhaseStart(event.phase, event.detail);
        break;
      case "phase_end":
        this.onPhaseEnd(event.phase, event.detail);
        break;
      case "thought_complete":
        this.recordEvent("phase", "thought_complete", {
          phase: event.thought.layer,
          detail: `${event.thought.layer}: ${event.thought.output.slice(0, 100)}`,
          data: {
            layer: event.thought.layer,
            confidence: event.thought.confidence,
            tokenCost: event.thought.tokenCost,
          },
        });
        break;
      case "block_detected":
        this.recordEvent("error", "block_signal", {
          detail: `BLOCK: ${event.reason}`,
          data: { reason: event.reason },
        });
        break;
      case "reflection":
        this.recordEvent("review", "reflection", {
          detail: `Reflection (${event.atomCount} atoms): ${event.summary.slice(0, 100)}`,
        });
        break;
      case "verification":
        this.recordEvent("review", "verification", {
          phase: event.phase,
          detail: `${event.passed ? "✔" : "✖"} ${event.detail}`,
        });
        break;
      case "pipeline_complete":
        this.recordEvent("pipeline", "complete", {
          detail: `${event.totalThoughts} thoughts, ${event.totalTokens} tokens`,
          data: { totalThoughts: event.totalThoughts, totalTokens: event.totalTokens },
        });
        break;
      case "error":
        this.errors.push(event.message);
        this.recordEvent("error", "error", { detail: event.message });
        break;
      case "hallucination":
        this.hallucinations.push(event.message);
        this.recordEvent("guard", "hallucination", { detail: event.message });
        break;
      case "cost" as any:
        if ((event as any).data?.cost) {
          this.totalCost += (event as any).data.cost;
        }
        break;
    }
  }

  // ─── STREAMING EVENT HANDLER ────────────────────────────

  onStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case "pipeline_start":
        this.onPipelineStart(event.detail ?? "");
        break;
      case "pipeline_end":
        this.onPipelineEnd(event.detail?.startsWith("✔") ?? false);
        break;
      case "block_start":
        this.onBlockStart(event.detail ?? "");
        break;
      case "block_end":
        this.onBlockEnd();
        break;
      case "atom_start":
        this.onAtomStart(event.detail ?? "");
        break;
      case "atom_end":
        this.onAtomEnd(true, event.tokens);
        break;
      case "tool_call":
        this.onToolCall(event.detail ?? "");
        break;
      case "tool_result":
        this.onToolResult(event.detail ?? "");
        break;
      case "error":
        this.errors.push(event.detail ?? "");
        this.recordEvent("error", "stream_error", { detail: event.detail ?? "" });
        break;
      case "warning":
        this.warnings.push(event.detail ?? "");
        this.recordEvent("system", "warning", { detail: event.detail ?? "" });
        break;
    }
  }

  // ─── LIFECYCLE METHODS ──────────────────────────────────

  onPipelineStart(task: string): void {
    this.pipelineStartTime = Date.now();
    this.task = task;
    this.events = [];
    this.blocks = [];
    this.phases = [];
    this.errors = [];
    this.warnings = [];
    this.eventCounter = 0;
    this.totalCost = 0;

    this.recordEvent("pipeline", "start", { detail: `Pipeline started: ${task.slice(0, 100)}` });
    this.sendTelegram(`⚒️ *Forge Pipeline Başladı*\n\n📋 ${escapeMarkdown(task.slice(0, 200))}`);
  }

  onPipelineEnd(success: boolean): void {
    const duration = Date.now() - this.pipelineStartTime;
    const summary = this.getSummary();
    this.recordEvent("pipeline", "end", {
      detail: `Pipeline ${success ? "completed" : "failed"} in ${formatDuration(duration)}`,
      data: {
        success,
        durationMs: duration,
        blocks: this.blocks.length,
        atoms: summary.totalAtoms,
        passed: summary.passedAtoms,
        failed: summary.failedAtoms,
        cost: summary.totalCost,
        tokens: summary.totalTokens,
        hallucinations: summary.totalHallucinations,
      },
    });

    // Write summary file
    const summaryPath = this.logPath.replace(".jsonl", "-summary.md");
    writeFileSync(summaryPath, this.formatMarkdownSummary(summary), "utf-8");

    // Telegram final report
    this.sendTelegramFinal(summary);
  }

  onPhaseStart(phase: string, detail: string): void {
    this.currentPhase = {
      name: phase,
      startTime: Date.now(),
      detail,
    };
    this.phases.push(this.currentPhase);
    this.recordEvent("phase", "start", { phase, detail });
    this.sendTelegramThrottled(`👁️ *${escapeMarkdown(phase)}*: ${escapeMarkdown(detail.slice(0, 100))}`);
  }

  onPhaseEnd(phase: string, detail: string): void {
    if (this.currentPhase && this.currentPhase.name === phase) {
      this.currentPhase.endTime = Date.now();
      this.currentPhase.durationMs = this.currentPhase.endTime - this.currentPhase.startTime;
    }
    this.recordEvent("phase", "end", { phase, detail });
  }

  onBlockStart(detail: string): void {
    // Parse "Block 1/3: description"
    const match = detail.match(/Block (\d+)\/(\d+):\s*(.*)/);
    const index = match ? parseInt(match[1]) - 1 : this.blocks.length;
    const description = match?.[3] ?? detail;

    this.currentBlock = {
      index,
      description,
      startTime: Date.now(),
      totalAtoms: 0,
      passedAtoms: 0,
      failedAtoms: 0,
      skippedAtoms: 0,
      atoms: [],
    };
    this.blocks.push(this.currentBlock);
    this.recordEvent("block", "start", { blockIndex: index, detail });
    this.sendTelegramThrottled(`📦 *Block ${index + 1}*: ${escapeMarkdown(description.slice(0, 100))}`);
  }

  onBlockEnd(): void {
    if (this.currentBlock) {
      this.currentBlock.endTime = Date.now();
      this.currentBlock.durationMs = this.currentBlock.endTime - this.currentBlock.startTime;

      const b = this.currentBlock;
      this.sendTelegramThrottled(
        `✅ Block ${b.index + 1} tamamlandı — ${b.passedAtoms}/${b.totalAtoms} atom başarılı (${formatDuration(b.durationMs)})`,
      );
    }
    this.currentBlock = null;
  }

  onAtomStart(detail: string): void {
    // Parse "Atom 1/3: description"
    const match = detail.match(/Atom (\d+)\/(\d+):\s*(.*)/);
    const atomIndex = match ? parseInt(match[1]) - 1 : (this.currentBlock?.atoms.length ?? 0);
    const description = match?.[3] ?? detail;

    this.currentAtom = {
      blockIndex: this.currentBlock?.index ?? 0,
      atomIndex,
      description,
      startTime: Date.now(),
      attempts: 1,
      status: "running",
      toolCalls: [],
      operations: [],
    };

    if (this.currentBlock) {
      this.currentBlock.atoms.push(this.currentAtom);
      this.currentBlock.totalAtoms = this.currentBlock.atoms.length;
    }

    this.recordEvent("atom", "start", {
      blockIndex: this.currentBlock?.index,
      atomIndex,
      detail,
    });
  }

  onAtomEnd(passed: boolean, tokens?: number): void {
    if (this.currentAtom) {
      this.currentAtom.endTime = Date.now();
      this.currentAtom.durationMs = this.currentAtom.endTime - this.currentAtom.startTime;
      this.currentAtom.status = passed ? "passed" : "failed";
      this.currentAtom.tokenCost = tokens;

      if (this.currentBlock) {
        if (passed) this.currentBlock.passedAtoms++;
        else this.currentBlock.failedAtoms++;
      }

      const emoji = passed ? "✔" : "✖";
      this.recordEvent("atom", "end", {
        blockIndex: this.currentAtom.blockIndex,
        atomIndex: this.currentAtom.atomIndex,
        detail: `${emoji} ${this.currentAtom.description.slice(0, 60)} (${formatDuration(this.currentAtom.durationMs)})`,
        data: { passed, tokens, attempts: this.currentAtom.attempts },
      });
    }
    this.currentAtom = null;
  }

  // ─── WORKER TRACKING ───────────────────────────────────

  onWorkerInput(input: string): void {
    if (this.currentAtom) {
      this.currentAtom.workerInput = input;
    }
    this.recordEvent("worker", "input", {
      detail: `Worker input: ${input.slice(0, 150)}`,
      data: { inputLength: input.length },
    });
  }

  onWorkerOutput(output: string, confidence?: number): void {
    if (this.currentAtom) {
      this.currentAtom.workerOutput = output;
      this.currentAtom.confidence = confidence;
    }
    this.recordEvent("worker", "output", {
      detail: `Worker output: conf=${((confidence ?? 0) * 100).toFixed(0)}% len=${output.length}`,
      data: { outputLength: output.length, confidence },
    });
  }

  onWorkerRetry(attempt: number, reason: string): void {
    if (this.currentAtom) {
      this.currentAtom.attempts = attempt + 1;
      this.currentAtom.rejectionFeedback = reason;
    }
    const isHallucination = reason.includes("Hallucination");
    const category = isHallucination ? "guard" : "worker";
    this.recordEvent(category, "retry", {
      detail: `Retry #${attempt + 1}${isHallucination ? " (hallucination recovery)" : ""}: ${reason.slice(0, 100)}`,
    });
  }

  // ─── TOOL TRACKING ─────────────────────────────────────

  onToolCall(detail: string): void {
    // Parse "toolName(args)"
    const match = detail.match(/^(\w+)\((.*)?\)$/);
    const name = match?.[1] ?? detail;
    const args = match?.[2] ?? "";

    this.currentToolCall = {
      name,
      args: args.slice(0, 200),
      timestamp: Date.now(),
    };

    if (this.currentAtom) {
      this.currentAtom.toolCalls.push(this.currentToolCall);
    }

    this.recordEvent("tool", "call", { detail: `🔧 ${name}(${args.slice(0, 80)})` });
  }

  onToolResult(detail: string): void {
    if (this.currentToolCall) {
      this.currentToolCall.durationMs = Date.now() - this.currentToolCall.timestamp;
      this.currentToolCall.result = detail.slice(0, 500);
      this.currentToolCall.success = detail.includes("✔") || !detail.includes("✖");
    }
    this.recordEvent("tool", "result", { 
      detail,
      data: { success: this.currentToolCall?.success }
    });
    this.currentToolCall = null;
  }

  // ─── OPERATION TRACKING ─────────────────────────────────

  onOperation(type: string, success: boolean, path?: string, detail?: string): void {
    if (this.currentAtom) {
      this.currentAtom.operations.push({ type, path, success, detail });
    }
    this.recordEvent("worker", "operation", {
      detail: `${success ? "✔" : "✖"} ${type} ${path ?? ""} ${detail ?? ""}`.trim(),
    });
  }

  // ─── REVIEW TRACKING ───────────────────────────────────

  onReviewResult(phase: string, passed: boolean, detail: string): void {
    if (this.currentAtom) {
      this.currentAtom.reviewResult = detail;
    }
    this.recordEvent("review", phase, { detail: `${passed ? "✔" : "✖"} ${detail}` });
  }

  // ─── QUERIES ────────────────────────────────────────────

  /** Get full chronological timeline. */
  getTimeline(): readonly ObserverEvent[] {
    return this.events;
  }

  /** Get all block records with atom details. */
  getBlocks(): readonly BlockRecord[] {
    return this.blocks;
  }

  /** Get detailed info for a specific atom. */
  getAtomDetail(blockIndex: number, atomIndex: number): AtomRecord | undefined {
    return this.blocks[blockIndex]?.atoms[atomIndex];
  }

  /** Get complete pipeline summary. */
  getSummary(): PipelineSummary {
    const endTime = Date.now();
    const durationMs = endTime - this.pipelineStartTime;
    let passedAtoms = 0;
    let failedAtoms = 0;
    let totalToolCalls = 0;
    let totalHallucinations = this.hallucinations.length;
    let totalTokens = 0;

    for (const block of this.blocks) {
      passedAtoms += block.passedAtoms;
      failedAtoms += block.failedAtoms;
      for (const atom of block.atoms) {
        totalToolCalls += atom.toolCalls.length;
        totalTokens += atom.tokenCost ?? 0;
      }
    }

    return {
      task: this.task,
      startTime: this.pipelineStartTime,
      endTime,
      durationMs,
      durationStr: formatDuration(durationMs),
      success: failedAtoms === 0 && this.errors.length === 0,
      totalBlocks: this.blocks.length,
      totalAtoms: passedAtoms + failedAtoms,
      passedAtoms,
      failedAtoms,
      totalToolCalls,
      totalHallucinations,
      totalTokens,
      totalCost: this.totalCost,
      phases: [...this.phases],
      blocks: [...this.blocks],
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  /** Get log file path. */
  getLogPath(): string {
    return this.logPath;
  }

  // ─── FORMATTING ─────────────────────────────────────────

  /** Human-readable markdown summary. */
  formatMarkdownSummary(summary?: PipelineSummary): string {
    const s = summary ?? this.getSummary();
    const lines: string[] = [
      `# Forge Pipeline Report`,
      ``,
      `**Task:** ${s.task}`,
      `**Duration:** ${s.durationStr}`,
      `**Status:** ${s.success ? "✅ Success" : "❌ Failed"}`,
      ``,
      `## Overview`,
      `| Metrics | Value |`,
      `|---------|-------|`,
      `| Blocks | ${s.totalBlocks} |`,
      `| Atoms | ${s.totalAtoms} (${s.passedAtoms} passed, ${s.failedAtoms} failed) |`,
      `| Hallucinations | ${s.totalHallucinations} 🛡️ |`,
      `| Tool Calls | ${s.totalToolCalls} |`,
      `| Tokens | ${s.totalTokens.toLocaleString()} |`,
      `| Cost | $${s.totalCost.toFixed(4)} |`,
      ``,
    ];

    // Phases
    if (s.phases.length > 0) {
      lines.push(`## Phases`, ``);
      for (const phase of s.phases) {
        const dur = phase.durationMs ? ` (${formatDuration(phase.durationMs)})` : "";
        lines.push(`- **${phase.name}**${dur}: ${phase.detail ?? ""}`);
      }
      lines.push(``);
    }

    // Blocks & Atoms
    for (const block of s.blocks) {
      const dur = block.durationMs ? ` — ${formatDuration(block.durationMs)}` : "";
      lines.push(
        `## Block ${block.index + 1}: ${block.description}${dur}`,
        `${block.passedAtoms}/${block.totalAtoms} atoms passed`,
        ``,
      );

      for (const atom of block.atoms) {
        const emoji = atom.status === "passed" ? "✅" : atom.status === "failed" ? "❌" : "⏭️";
        const aDur = atom.durationMs ? ` (${formatDuration(atom.durationMs)})` : "";
        const conf = atom.confidence ? ` conf=${(atom.confidence * 100).toFixed(0)}%` : "";
        lines.push(`### ${emoji} Atom ${atom.atomIndex + 1}: ${atom.description}${aDur}${conf}`);

        if (atom.attempts > 1) {
          lines.push(`- ⚠️ ${atom.attempts} attempts needed`);
        }
        if (atom.toolCalls.length > 0) {
          lines.push(`- 🔧 ${atom.toolCalls.length} tool calls:`);
          for (const tc of atom.toolCalls.slice(0, 10)) {
            const tcDur = tc.durationMs ? ` (${formatDuration(tc.durationMs)})` : "";
            lines.push(`  - \`${tc.name}\`${tcDur}`);
          }
          if (atom.toolCalls.length > 10) {
            lines.push(`  - ... and ${atom.toolCalls.length - 10} more`);
          }
        }
        if (atom.operations.length > 0) {
          lines.push(`- 📁 ${atom.operations.length} file operations:`);
          for (const op of atom.operations) {
            lines.push(`  - ${op.success ? "✔" : "✖"} ${op.type} ${op.path ?? ""}`);
          }
        }
        if (atom.rejectionFeedback) {
          lines.push(`- 🔴 Rejection: ${atom.rejectionFeedback.slice(0, 200)}`);
        }
        lines.push(``);
      }
    }

    // Errors
    if (s.errors.length > 0) {
      lines.push(`## Errors`, ``);
      for (const err of s.errors) {
        lines.push(`- ❌ ${err}`);
      }
      lines.push(``);
    }

    // Hallucinations
    if (this.hallucinations.length > 0) {
      lines.push(`## Hallucinations 🛡️`, ``);
      for (const h of this.hallucinations) {
        lines.push(`- ⚠️ ${h}`);
      }
      lines.push(``);
    }

    return lines.join("\n");
  }

  /** Compact Telegram-friendly summary. */
  formatTelegramSummary(summary?: PipelineSummary): string {
    const s = summary ?? this.getSummary();
    const status = s.success ? "✅ Başarılı" : "❌ Başarısız";
    const lines = [
      `⚒️ *Forge Pipeline Raporu*`,
      ``,
      `*Durum:* ${status}`,
      `*Süre:* ${s.durationStr}`,
      `*Bloklar:* ${s.totalBlocks}`,
      `*Atomlar:* ${s.passedAtoms}✔ / ${s.failedAtoms}✖`,
      `*Hallucinations:* ${s.totalHallucinations} 🛡️`,
      `*Tool Calls:* ${s.totalToolCalls}`,
      `*Tokens:* ${s.totalTokens.toLocaleString()}`,
      `*Maliyet:* $${s.totalCost.toFixed(4)}`,
    ];

    // Per-block summary
    for (const block of s.blocks) {
      const dur = block.durationMs ? ` (${formatDuration(block.durationMs)})` : "";
      const emoji = block.failedAtoms === 0 ? "✅" : "⚠️";
      lines.push(`\n${emoji} *Block ${block.index + 1}:* ${escapeMarkdown(block.description.slice(0, 50))}${dur}`);

      for (const atom of block.atoms) {
        const aEmoji = atom.status === "passed" ? "✔" : "✖";
        const aDur = atom.durationMs ? ` ${formatDuration(atom.durationMs)}` : "";
        lines.push(`  ${aEmoji} ${escapeMarkdown(atom.description.slice(0, 40))}${aDur}`);
      }
    }

    if (s.errors.length > 0) {
      lines.push(`\n❌ *Hatalar:*`);
      for (const err of s.errors.slice(0, 5)) {
        lines.push(`  • ${escapeMarkdown(err.slice(0, 80))}`);
      }
    }

    return lines.join("\n");
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private recordEvent(
    category: ObserverCategory,
    type: string,
    opts: {
      phase?: string;
      blockIndex?: number;
      atomIndex?: number;
      detail: string;
      data?: Record<string, unknown>;
    },
  ): void {
    const event: ObserverEvent = {
      id: ++this.eventCounter,
      timestamp: Date.now(),
      elapsed: this.pipelineStartTime > 0 ? Date.now() - this.pipelineStartTime : 0,
      category,
      type,
      phase: opts.phase,
      blockIndex: opts.blockIndex ?? this.currentBlock?.index,
      atomIndex: opts.atomIndex ?? this.currentAtom?.atomIndex,
      detail: opts.detail,
      data: opts.data,
    };

    this.events.push(event);

    // Append to JSONL log
    try {
      appendFileSync(this.logPath, JSON.stringify(event) + "\n", "utf-8");
    } catch { /* log write is best-effort */ }
  }

  private sendTelegram(text: string): void {
    if (!this.telegramCallback) return;
    this.telegramCallback(text).catch(() => {});
    this.lastTelegramUpdate = Date.now();
  }

  private sendTelegramThrottled(text: string): void {
    if (!this.telegramCallback) return;
    const now = Date.now();
    if (now - this.lastTelegramUpdate < this.telegramThrottleMs) return;
    this.sendTelegram(text);
  }

  private sendTelegramFinal(summary: PipelineSummary): void {
    if (!this.telegramCallback) return;
    this.telegramCallback(this.formatTelegramSummary(summary)).catch(() => {});
  }
}

// ─── HELPERS ─────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// ─── OBSERVER FACTORY ────────────────────────────────────────

/**
 * Create an observer and wire it to orchestrator + streaming.
 */
export function createPipelineObserver(
  projectRoot: string,
  options?: {
    telegramCallback?: (text: string) => Promise<void>;
    telegramThrottleMs?: number;
  },
): PipelineObserver {
  const observer = new PipelineObserver(projectRoot);

  if (options?.telegramCallback) {
    observer.enableTelegram(options.telegramCallback, options.telegramThrottleMs);
  }

  return observer;
}
