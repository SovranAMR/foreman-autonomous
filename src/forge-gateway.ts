/**
 * FOREMAN — Forge Gateway Bridge
 *
 * Connects Telegram/WhatsApp messaging to the forge pipeline.
 * /forge command triggers the full 4-layer pipeline from messaging.
 *
 * Capabilities:
 * - /forge <task> — trigger forge pipeline from Telegram
 * - Real-time progress updates via Telegram messages
 * - Pipeline result summary sent to chat
 * - Cost and token usage reporting
 * - Sub-agent team commands (/team, /agents)
 * - Session management commands (/session, /sessions)
 * - Identity-aware responses
 */

import type { Engine } from "./engine.js";
import { Orchestrator, type OrchestratorEvent } from "./orchestrator.js";
import type { StreamEvent } from "./streaming-pipeline.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ForgeGatewayConfig {
  /** Minimum interval between progress updates (ms) */
  updateIntervalMs: number;
  /** Whether to send detailed tool call logs */
  detailedToolLogs: boolean;
  /** Max message length for Telegram */
  maxMessageLength: number;
}

export interface MessageSender {
  send(text: string, parseMode?: string): Promise<void>;
  editLast(text: string, parseMode?: string): Promise<void>;
}

const DEFAULT_CONFIG: ForgeGatewayConfig = {
  updateIntervalMs: 3000,
  detailedToolLogs: false,
  maxMessageLength: 4000,
};

// ─── FORGE GATEWAY BRIDGE ────────────────────────────────────

export class ForgeGatewayBridge {
  private engine: Engine;
  private config: ForgeGatewayConfig;
  private activeRuns = new Map<string, { orchestrator: Orchestrator; startedAt: number }>();
  private _lastPipelineStatus: { phase: string; task?: string; summary?: string; startedAt?: number; endedAt?: number } | null = null;

  constructor(engine: Engine, config?: Partial<ForgeGatewayConfig>) {
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Handle /forge command.
   * Runs the full pipeline and sends updates to the chat.
   */
  async runForge(task: string, chatId: string, sender: MessageSender): Promise<void> {
    // Check if already running
    if (this.activeRuns.has(chatId)) {
      await sender.send("⚠️ Bir forge pipeline zaten çalışıyor. Bitene kadar bekle veya /cancel ile iptal et.");
      return;
    }

    const orchestrator = new Orchestrator(this.engine);
    this.activeRuns.set(chatId, { orchestrator, startedAt: Date.now() });

    // Send initial message
    await sender.send(`⚒️ **Forge Pipeline başlatılıyor...**\n\nTask: ${task.slice(0, 200)}`);

    // Track progress for throttled updates
    let lastUpdateTime = Date.now();
    let progressBuffer: string[] = [];

    // Listen to orchestrator events
    orchestrator.on((event: OrchestratorEvent) => {
      const now = Date.now();
      const line = this.formatEvent(event);
      if (line) progressBuffer.push(line);

      // Throttle updates
      if (now - lastUpdateTime >= this.config.updateIntervalMs && progressBuffer.length > 0) {
        const update = progressBuffer.join("\n");
        progressBuffer = [];
        lastUpdateTime = now;
        sender.send(update).catch(() => { });
      }
    });

    try {
      // Run the pipeline
      const result = await orchestrator.run(task);

      // Flush remaining progress
      if (progressBuffer.length > 0) {
        await sender.send(progressBuffer.join("\n"));
      }

      // Send final result
      const costReport = this.engine.costTracker.formatReport().replace(/\x1b\[[0-9;]*m/g, "");
      const summary = this.buildSummary(result, costReport);
      await sender.send(summary, "markdown");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await sender.send(`❌ **Forge Pipeline hata:**\n\n${errorMsg.slice(0, 500)}`);
    } finally {
      this.activeRuns.delete(chatId);
    }
  }

  /**
   * Cancel an active forge run.
   */
  async cancelForge(chatId: string, sender: MessageSender): Promise<void> {
    const run = this.activeRuns.get(chatId);
    if (!run) {
      await sender.send("ℹ️ Çalışan forge pipeline yok.");
      return;
    }

    this.activeRuns.delete(chatId);
    await sender.send("🛑 Forge pipeline iptal edildi.");
  }

  /**
   * Notify bridge that a pipeline started (for status tracking).
   */
  notifyPipelineStart(task: string): void {
    // Store pipeline status for gateway queries
    this._lastPipelineStatus = { phase: "running", task, startedAt: Date.now() };
  }

  /**
   * Notify bridge that a pipeline ended.
   */
  notifyPipelineEnd(success: boolean, summary: string): void {
    this._lastPipelineStatus = { phase: success ? "complete" : "failed", summary, endedAt: Date.now() };
  }

  /**
   * Get status of active forge runs.
   */
  getActiveRuns(): Array<{ chatId: string; startedAt: number; duration: number }> {
    return [...this.activeRuns.entries()].map(([chatId, run]) => ({
      chatId,
      startedAt: run.startedAt,
      duration: Date.now() - run.startedAt,
    }));
  }

  /**
   * Handle all forge-related slash commands.
   * Returns response text or null if not a forge command.
   */
  handleCommand(text: string, chatId: string, sender: MessageSender): string | null {
    const trimmed = text.trim();

    // /forge <task>
    if (trimmed.startsWith("/forge ") || trimmed.startsWith("/forge\n")) {
      const task = trimmed.slice(7).trim();
      if (!task) return "Usage: /forge <task description>";

      // Run async — don't block
      this.runForge(task, chatId, sender).catch(err => {
        sender.send(`❌ Forge error: ${err}`).catch(() => { });
      });

      return null; // Will send its own messages
    }

    // /cancel
    if (trimmed === "/cancel" || trimmed === "/iptal") {
      this.cancelForge(chatId, sender).catch(() => { });
      return null;
    }

    // /cost
    if (trimmed === "/cost" || trimmed === "/maliyet") {
      const report = this.engine.costTracker.formatReport().replace(/\x1b\[[0-9;]*m/g, "");
      return report;
    }

    // /project
    if (trimmed === "/project" || trimmed === "/proje") {
      const { formatProjectContext } = require("./project-detector.js");
      return formatProjectContext(this.engine.projectInfo);
    }

    // /rollback
    if (trimmed === "/rollback" || trimmed === "/geri") {
      const result = this.engine.rollback.rollbackLastAtom();
      if (result) {
        return result.success
          ? `✅ Rollback başarılı: ${result.filesReverted.length} dosya geri alındı`
          : `❌ Rollback başarısız: ${result.error}`;
      }
      return "ℹ️ Rollback noktası bulunamadı.";
    }

    // /identity
    if (trimmed === "/identity" || trimmed === "/kimlik") {
      const identity = this.engine.identity?.getContext();
      if (!identity?.identity) return "ℹ️ Identity dosyası bulunamadı.";
      return `🆔 **${identity.identity.name}**\n${identity.identity.vibe ?? ""}\n\nUser: ${identity.user?.name ?? "Unknown"}`;
    }

    // /agents
    if (trimmed === "/agents" || trimmed === "/ajanlar") {
      const status = this.engine.subAgents?.getStatus();
      if (!status) return "ℹ️ Sub-agent engine aktif değil.";
      return [
        "🤖 **Sub-Agents**",
        `├ Total: ${status.total}`,
        `├ Running: ${status.running}`,
        `├ Completed: ${status.completed}`,
        `├ Failed: ${status.failed}`,
        `└ Pending: ${status.pending}`,
      ].join("\n");
    }

    // /sessions
    if (trimmed === "/sessions" || trimmed === "/oturumlar") {
      const stats = this.engine.sessionLifecycle?.getStats();
      if (!stats) return "ℹ️ Session engine aktif değil.";
      return [
        "📋 **Sessions**",
        `├ Total: ${stats.total}`,
        `├ Active: ${stats.active}`,
        `├ Idle: ${stats.idle}`,
        `├ Tokens: ${stats.totalTokens.toLocaleString()}`,
        `└ Teams: ${stats.teams}`,
      ].join("\n");
    }

    return null;
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private formatEvent(event: OrchestratorEvent): string | null {
    switch (event.type) {
      case "phase_start":
        return `▶ ${this.phaseEmoji(event.phase)} ${event.phase} — ${event.detail ?? ""}`;
      case "phase_end":
        return `✅ ${event.phase} tamamlandı`;
      case "thought_complete":
        return null; // Too noisy
      case "error":
        return `❌ ${event.message}`;
      case "pipeline_complete":
        return null; // Handled in summary
      default:
        return null;
    }
  }

  private phaseEmoji(phase: string): string {
    const map: Record<string, string> = {
      vision: "👁️",
      decompose: "🔪",
      research: "🔍",
      atomize: "⚛️",
      execute: "⚡",
      verify: "✅",
      reflect: "🪞",
    };
    return map[phase] ?? "•";
  }

  private buildSummary(
    result: { success: boolean; totalThoughts: number; totalTokens: number; blockedAt?: string },
    costReport: string,
  ): string {
    const icon = result.success ? "✅" : "❌";
    const status = result.success ? "Başarılı" : `Blocked: ${result.blockedAt ?? "Unknown"}`;
    const duration = this.activeRuns.size > 0
      ? `${Math.round((Date.now() - ([...this.activeRuns.values()][0]?.startedAt ?? Date.now())) / 1000)}s`
      : "N/A";

    return [
      `${icon} **Forge Pipeline ${status}**`,
      "",
      `🧠 Thoughts: ${result.totalThoughts}`,
      `📊 Tokens: ${result.totalTokens.toLocaleString()}`,
      `⏱️ Duration: ${duration}`,
      "",
      costReport,
    ].join("\n");
  }
}
