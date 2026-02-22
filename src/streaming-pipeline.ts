/**
 * FOREMAN — Streaming Pipeline Engine
 *
 * Real-time pipeline output for forge operations.
 * Shows each phase, tool call, and result as it happens.
 *
 * OpenClaw'dan alınan: streaming token output + event system
 * Foreman farkı: 4-layer pipeline'a özel event types + TUI rendering
 *
 * Capabilities:
 * - Phase-level streaming (vision/decompose/research/atomize/execute)
 * - Tool call/result streaming
 * - Token-by-token LLM output
 * - Progress bars (block/atom level)
 * - Cost tracking per phase
 * - Elapsed time tracking
 * - Multiple output targets (TTY, file, callback)
 */

import { EventEmitter } from "node:events";
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  phase?: string;
  detail?: string;
  tokens?: number;
  cost?: number;
}

export type StreamEventType =
  | "pipeline_start"
  | "pipeline_end"
  | "phase_start"
  | "phase_end"
  | "block_start"
  | "block_end"
  | "atom_start"
  | "atom_end"
  | "tool_call"
  | "tool_result"
  | "token"
  | "error"
  | "warning"
  | "checkpoint"
  | "rollback"
  | "cost_update";

export interface StreamTarget {
  write(event: StreamEvent, formatted: string): void;
  flush?(): void;
}

export interface PipelineProgress {
  phase: string;
  totalBlocks: number;
  currentBlock: number;
  totalAtoms: number;
  currentAtom: number;
  totalTokens: number;
  totalCost: number;
  elapsedMs: number;
  toolCalls: number;
  errors: number;
}

// ─── BRAND COLORS (Foreman theme) ─────────────────────────────

const BRAND = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gold: "\x1b[38;5;220m",
  blue: "\x1b[38;5;33m",
  green: "\x1b[38;5;40m",
  red: "\x1b[38;5;196m",
  cyan: "\x1b[38;5;51m",
  magenta: "\x1b[38;5;201m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

const PHASE_ICONS: Record<string, string> = {
  vision: "👁️",
  decompose: "🔪",
  research: "🔍",
  atomize: "⚛️",
  execute: "⚡",
  verify: "✅",
  reflect: "🪞",
  tool_call: "🔧",
  real_execute: "🔨",
  complete: "🏁",
};

// ─── STREAMING PIPELINE ENGINE ───────────────────────────────

export class StreamingPipeline extends EventEmitter {
  private targets: StreamTarget[] = [];
  private startTime = 0;
  private progress: PipelineProgress = {
    phase: "idle",
    totalBlocks: 0,
    currentBlock: 0,
    totalAtoms: 0,
    currentAtom: 0,
    totalTokens: 0,
    totalCost: 0,
    elapsedMs: 0,
    toolCalls: 0,
    errors: 0,
  };
  private eventLog: StreamEvent[] = [];
  private isTTY: boolean;

  constructor() {
    super();
    this.isTTY = process.stdout.isTTY ?? false;
  }

  /**
   * Add an output target (TTY console, file, callback, etc.)
   */
  addTarget(target: StreamTarget): void {
    this.targets.push(target);
  }

  /**
   * Get current progress snapshot.
   */
  getProgress(): PipelineProgress {
    return {
      ...this.progress,
      elapsedMs: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get all recorded events.
   */
  getEventLog(): readonly StreamEvent[] {
    return this.eventLog;
  }

  /**
   * Stream an event to all targets.
   */
  stream(event: Omit<StreamEvent, "timestamp">): void {
    const fullEvent: StreamEvent = { ...event, timestamp: Date.now() };
    this.eventLog.push(fullEvent);

    // Update progress
    this.updateProgress(fullEvent);

    // Format and send to targets
    const formatted = this.format(fullEvent);
    for (const target of this.targets) {
      target.write(fullEvent, formatted);
    }

    // Emit for external listeners
    this.emit("event", fullEvent);
  }

  // ─── CONVENIENCE METHODS ────────────────────────────────

  pipelineStart(task: string): void {
    this.startTime = Date.now();
    this.stream({ type: "pipeline_start", detail: task });
  }

  pipelineEnd(success: boolean, summary?: string): void {
    this.stream({
      type: "pipeline_end",
      detail: success ? `✔ ${summary ?? "Complete"}` : `✖ ${summary ?? "Failed"}`,
      tokens: this.progress.totalTokens,
      cost: this.progress.totalCost,
    });
    for (const target of this.targets) {
      target.flush?.();
    }
  }

  phaseStart(phase: string, detail?: string): void {
    this.stream({ type: "phase_start", phase, detail });
  }

  phaseEnd(phase: string, detail?: string, tokens?: number): void {
    this.stream({ type: "phase_end", phase, detail, tokens });
  }

  blockStart(index: number, total: number, description: string): void {
    this.progress.totalBlocks = total;
    this.progress.currentBlock = index;
    this.stream({ type: "block_start", detail: `Block ${index + 1}/${total}: ${description}` });
  }

  blockEnd(index: number): void {
    this.stream({ type: "block_end", detail: `Block ${index + 1} complete` });
  }

  atomStart(index: number, total: number, description: string): void {
    this.progress.totalAtoms = total;
    this.progress.currentAtom = index;
    this.stream({ type: "atom_start", detail: `Atom ${index + 1}/${total}: ${description}` });
  }

  atomEnd(index: number, tokens?: number, cost?: number): void {
    if (tokens) this.progress.totalTokens += tokens;
    if (cost) this.progress.totalCost += cost;
    this.stream({ type: "atom_end", detail: `Atom ${index + 1} done`, tokens, cost });
  }

  toolCall(name: string, args: string): void {
    this.progress.toolCalls++;
    this.stream({ type: "tool_call", detail: `${name}(${args.slice(0, 80)})` });
  }

  toolResult(name: string, success: boolean, preview: string): void {
    this.stream({ type: "tool_result", detail: `${name} → ${success ? "✔" : "✖"} ${preview.slice(0, 80)}` });
  }

  token(text: string): void {
    // Don't log individual tokens — too noisy
    if (this.isTTY) {
      process.stdout.write(text);
    }
  }

  error(message: string): void {
    this.progress.errors++;
    this.stream({ type: "error", detail: message });
  }

  warning(message: string): void {
    this.stream({ type: "warning", detail: message });
  }

  // ─── FORMATTING ─────────────────────────────────────────

  private format(event: StreamEvent): string {
    const elapsed = this.startTime > 0
      ? `${BRAND.gray}[${formatDuration(Date.now() - this.startTime)}]${BRAND.reset} `
      : "";
    const icon = PHASE_ICONS[event.phase ?? ""] ?? "•";

    switch (event.type) {
      case "pipeline_start":
        return `\n${BRAND.gold}${BRAND.bold}╔══════════════════════════════════════════╗${BRAND.reset}\n` +
          `${BRAND.gold}║  ${BRAND.bold}⚒️  FORGE PIPELINE${BRAND.reset}${BRAND.gold}                       ║${BRAND.reset}\n` +
          `${BRAND.gold}╠══════════════════════════════════════════╣${BRAND.reset}\n` +
          `${BRAND.gold}║${BRAND.reset}  ${event.detail?.slice(0, 38).padEnd(38)}  ${BRAND.gold}║${BRAND.reset}\n` +
          `${BRAND.gold}╚══════════════════════════════════════════╝${BRAND.reset}\n`;

      case "pipeline_end": {
        const costStr = this.progress.totalCost > 0
          ? `  💰 $${this.progress.totalCost.toFixed(4)}`
          : "";
        return `\n${elapsed}${BRAND.gold}${BRAND.bold}═══ ${event.detail} ═══${BRAND.reset}` +
          `\n  🧠 ${this.progress.totalTokens} tokens${costStr}` +
          `  🔧 ${this.progress.toolCalls} tool calls` +
          `  ⏱️ ${formatDuration(Date.now() - this.startTime)}\n`;
      }

      case "phase_start":
        return `${elapsed}${BRAND.cyan}${icon} ${event.phase}${BRAND.reset} ${BRAND.dim}${event.detail ?? ""}${BRAND.reset}`;

      case "phase_end":
        return `${elapsed}${BRAND.green}${icon} ${event.phase} ✔${BRAND.reset} ${BRAND.dim}${event.detail ?? ""}${BRAND.reset}`;

      case "block_start":
        return `\n${elapsed}${BRAND.blue}${BRAND.bold}┌─ ${event.detail}${BRAND.reset}`;

      case "block_end":
        return `${elapsed}${BRAND.blue}└─ ${event.detail}${BRAND.reset}`;

      case "atom_start":
        return `${elapsed}${BRAND.magenta}  ├ ${event.detail}${BRAND.reset}`;

      case "atom_end": {
        const tokenInfo = event.tokens ? ` (${event.tokens} tokens)` : "";
        return `${elapsed}${BRAND.green}  ├ ✔ ${event.detail}${tokenInfo}${BRAND.reset}`;
      }

      case "tool_call":
        return `${elapsed}${BRAND.dim}  │ 🔧 ${event.detail}${BRAND.reset}`;

      case "tool_result":
        return `${elapsed}${BRAND.dim}  │ → ${event.detail}${BRAND.reset}`;

      case "error":
        return `${elapsed}${BRAND.red}${BRAND.bold}  ✖ ERROR: ${event.detail}${BRAND.reset}`;

      case "warning":
        return `${elapsed}${BRAND.gold}  ⚠ ${event.detail}${BRAND.reset}`;

      case "checkpoint":
        return `${elapsed}${BRAND.dim}  💾 Checkpoint saved${BRAND.reset}`;

      case "cost_update":
        return `${elapsed}${BRAND.dim}  💰 $${event.cost?.toFixed(4) ?? "?"}${BRAND.reset}`;

      default:
        return `${elapsed}${event.detail ?? ""}`;
    }
  }

  private updateProgress(event: StreamEvent): void {
    if (event.phase) this.progress.phase = event.phase;
    if (event.tokens) this.progress.totalTokens += event.tokens;
    if (event.cost) this.progress.totalCost += event.cost;
  }
}

// ─── OUTPUT TARGETS ──────────────────────────────────────────

/**
 * Console target — writes formatted output to stdout.
 */
export class ConsoleTarget implements StreamTarget {
  write(_event: StreamEvent, formatted: string): void {
    if (formatted) console.log(formatted);
  }
}

/**
 * File target — appends events to a log file.
 */
export class FileTarget implements StreamTarget {
  private path: string;

  constructor(logPath: string) {
    this.path = logPath;
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  write(event: StreamEvent, _formatted: string): void {
    const line = JSON.stringify(event) + "\n";
    appendFileSync(this.path, line, "utf-8");
  }
}

/**
 * Callback target — sends events to a callback function.
 */
export class CallbackTarget implements StreamTarget {
  private callback: (event: StreamEvent) => void;

  constructor(callback: (event: StreamEvent) => void) {
    this.callback = callback;
  }

  write(event: StreamEvent): void {
    this.callback(event);
  }
}

// ─── PROGRESS BAR ────────────────────────────────────────────

/**
 * Render a text-based progress bar.
 */
export function renderProgressBar(current: number, total: number, width = 30): string {
  if (total <= 0) return `[${"░".repeat(width)}] 0%`;
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent}%`;
}

// ─── HELPERS ─────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}
