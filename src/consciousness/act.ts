/**
 * FOREMAN — Act Module
 *
 * The "hands" of the consciousness loop.
 * Executes decisions produced by the ThinkEngine.
 *
 * Responsibilities:
 * 1. Send proactive Telegram notifications
 * 2. Execute auto-fix commands (service restarts, etc.)
 * 3. Log all actions to consciousness memory
 *
 * Safety:
 * - Auto-fix commands are whitelisted (only known-safe commands)
 * - All actions are logged with full traceability
 * - Failed auto-fixes are escalated to notify
 *
 * Architecture:
 *   ThinkDecision[] → execute() → ActResult[]
 */

import { execSync } from "node:child_process";
import type {
  ThinkDecision,
  ActResult,
  ProactiveMessenger,
} from "./types.js";

// ─── SAFE COMMAND PATTERNS ──────────────────────────────────

/**
 * Whitelist patterns for auto-fix commands.
 * Only commands matching these patterns can be auto-executed.
 */
const SAFE_COMMAND_PATTERNS = [
  /^systemctl\s+(--user\s+)?(restart|start)\s+[\w.-]+/,
  /^sudo\s+systemctl\s+(restart|start)\s+[\w.-]+/,
  /^docker\s+(restart|start)\s+[\w.-]+/,
  /^pm2\s+restart\s+[\w.-]+/,
];

/**
 * Validate that a command is safe to auto-execute.
 */
function isSafeCommand(cmd: string): boolean {
  return SAFE_COMMAND_PATTERNS.some(pattern => pattern.test(cmd.trim()));
}

// ─── ACT MODULE ─────────────────────────────────────────────

export class ActModule {
  private messenger: ProactiveMessenger | null = null;
  private ownerChatId: string = "";
  private actionLog: ActResult[] = [];

  /**
   * Set the messenger for sending proactive notifications.
   * Must be called before execute() can send notifications.
   */
  setMessenger(messenger: ProactiveMessenger, ownerChatId: string): void {
    this.messenger = messenger;
    this.ownerChatId = ownerChatId;
  }

  /**
   * Execute a list of decisions and return results.
   *
   * Execution order:
   * 1. auto_fix actions first (fix before notify)
   * 2. notify actions
   * 3. log_only actions (just record)
   */
  async execute(decisions: ThinkDecision[]): Promise<ActResult[]> {
    const results: ActResult[] = [];

    // Sort: auto_fix first, then notify, then log_only
    const sorted = [...decisions].sort((a, b) => {
      const order: Record<string, number> = { auto_fix: 0, notify: 1, log_only: 2 };
      return (order[a.action] ?? 3) - (order[b.action] ?? 3);
    });

    for (const decision of sorted) {
      try {
        const result = await this.executeOne(decision);
        results.push(result);
        this.actionLog.push(result);
      } catch (err) {
        const result: ActResult = {
          decision,
          success: false,
          detail: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
        results.push(result);
        this.actionLog.push(result);
      }
    }

    // Trim action log to last 200 entries
    if (this.actionLog.length > 200) {
      this.actionLog = this.actionLog.slice(-200);
    }

    return results;
  }

  /**
   * Execute a single decision.
   */
  private async executeOne(decision: ThinkDecision): Promise<ActResult> {
    switch (decision.action) {
      case "auto_fix":
        return this.executeAutoFix(decision);
      case "notify":
        return this.executeNotify(decision);
      case "log_only":
        return {
          decision,
          success: true,
          detail: "Logged (no action needed)",
          timestamp: Date.now(),
        };
      default:
        return {
          decision,
          success: false,
          detail: `Unknown action type: ${decision.action}`,
          timestamp: Date.now(),
        };
    }
  }

  /**
   * Execute an auto-fix command, then notify about it.
   */
  private async executeAutoFix(decision: ThinkDecision): Promise<ActResult> {
    if (!decision.fixCommand) {
      return {
        decision,
        success: false,
        detail: "Auto-fix decision without fixCommand",
        timestamp: Date.now(),
      };
    }

    // Safety check
    if (!isSafeCommand(decision.fixCommand)) {
      console.error(`[consciousness] BLOCKED unsafe auto-fix: ${decision.fixCommand}`);
      return {
        decision,
        success: false,
        detail: `Blocked: command not in whitelist — ${decision.fixCommand}`,
        timestamp: Date.now(),
      };
    }

    let fixOutput = "";
    let fixSuccess = false;

    try {
      fixOutput = execSync(decision.fixCommand, {
        encoding: "utf-8",
        timeout: 30_000,
        env: { ...process.env },
      }).trim();
      fixSuccess = true;
    } catch (err: unknown) {
      const error = err as { stderr?: string; message?: string };
      fixOutput = error.stderr ?? error.message ?? "Fix command failed";
      fixSuccess = false;
    }

    // Notify about the auto-fix attempt
    const notifyMessage = fixSuccess
      ? `🔧 Otomatik düzeltildi: ${decision.finding.summary}\n✅ Komut: ${decision.fixCommand}`
      : `🔧 Otomatik düzeltme BAŞARISIZ: ${decision.finding.summary}\n❌ Komut: ${decision.fixCommand}\n${fixOutput.slice(0, 200)}`;

    await this.sendNotification(notifyMessage);

    return {
      decision,
      success: fixSuccess,
      detail: fixSuccess
        ? `Auto-fixed: ${decision.fixCommand} → ${fixOutput.slice(0, 200)}`
        : `Fix failed: ${fixOutput.slice(0, 300)}`,
      timestamp: Date.now(),
    };
  }

  /**
   * Send a notification to the owner.
   */
  private async executeNotify(decision: ThinkDecision): Promise<ActResult> {
    const sent = await this.sendNotification(decision.payload);
    return {
      decision,
      success: sent,
      detail: sent ? "Notification sent" : "Failed to send notification (no messenger)",
      timestamp: Date.now(),
    };
  }

  /**
   * Send a proactive message via Telegram.
   */
  private async sendNotification(text: string): Promise<boolean> {
    if (!this.messenger || !this.ownerChatId) {
      console.log(`[consciousness] Would notify: ${text.slice(0, 100)}`);
      return false;
    }

    try {
      return await this.messenger.sendProactiveMessage(this.ownerChatId, text);
    } catch (err) {
      console.error(`[consciousness] Notification error:`, err);
      return false;
    }
  }

  /**
   * Get the action log for debugging/monitoring.
   */
  getActionLog(): ActResult[] {
    return [...this.actionLog];
  }

  /**
   * Get recent actions (last N).
   */
  getRecentActions(count = 10): ActResult[] {
    return this.actionLog.slice(-count);
  }
}
