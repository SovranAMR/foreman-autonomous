/**
 * FOREMAN — Think Engine
 *
 * The "brain" of the consciousness loop.
 * Receives SenseReports from all modules, evaluates findings,
 * and produces prioritized ThinkDecisions.
 *
 * Responsibilities:
 * 1. Priority scoring — severity + context-aware adjustments
 * 2. Spam protection — cooldown tracking, daily limits, quiet hours
 * 3. Escalation logic — repeated findings get higher priority
 * 4. Auto-fix decisions — known fixable issues get auto-fix actions
 *
 * Architecture:
 *   SenseReport[] → evaluate() → ThinkDecision[] (sorted by priority desc)
 *
 * The ThinkEngine is stateful: it tracks cooldowns and daily message counts
 * to prevent notification spam. State is serializable for persistence.
 */

import type {
  SenseReport,
  SenseFinding,
  ThinkDecision,
  ActionType,
  CooldownEntry,
  ConsciousnessConfig,
  Severity,
} from "./types.js";

// ─── AUTO-FIX REGISTRY ──────────────────────────────────────

/**
 * Known auto-fixable issues.
 * Maps finding key patterns to fix commands.
 */
const AUTO_FIX_REGISTRY: Record<string, string> = {
  "service_down_antigravity_gateway": "systemctl --user restart gcloud-cca-gateway 2>/dev/null || sudo systemctl restart gcloud-cca-gateway 2>/dev/null",
  "service_down_openclaw": "systemctl --user restart openclaw 2>/dev/null || sudo systemctl restart openclaw 2>/dev/null",
};

// ─── SEVERITY → BASE PRIORITY ──────────────────────────────

const SEVERITY_PRIORITY: Record<Severity, number> = {
  critical: 85,
  warning: 55,
  info: 20,
};

// ─── THINK ENGINE ────────────────────────────────────────────

export class ThinkEngine {
  private cooldowns: Map<string, CooldownEntry> = new Map();
  private todayMessageCount = 0;
  private todayDate = ""; // "YYYY-MM-DD" — resets daily

  constructor(private config: ConsciousnessConfig) {}

  /**
   * Evaluate all sense reports and produce decisions.
   *
   * Flow:
   * 1. Flatten all findings from all reports
   * 2. Score each finding (severity + escalation + context)
   * 3. Apply cooldown filter (skip recently notified)
   * 4. Apply quiet hours filter
   * 5. Apply daily limit
   * 6. Assign action type (notify / auto_fix / log_only)
   * 7. Sort by priority descending
   */
  evaluate(reports: SenseReport[]): ThinkDecision[] {
    // Reset daily counter if new day
    this.resetDailyCounterIfNeeded();

    const decisions: ThinkDecision[] = [];

    for (const report of reports) {
      if (report.error) {
        // Sense module itself failed — low priority log
        decisions.push({
          findingKey: `sense_error_${report.senseId}`,
          senseId: report.senseId,
          priority: 15,
          action: "log_only",
          payload: `Sense modülü hata: ${report.senseId} — ${report.error}`,
          finding: {
            key: `sense_error_${report.senseId}`,
            summary: report.error,
            severity: "info",
          },
        });
      }

      for (const finding of report.findings) {
        const decision = this.evaluateFinding(finding, report);
        if (decision) {
          decisions.push(decision);
        }
      }
    }

    // Sort by priority (highest first)
    decisions.sort((a, b) => b.priority - a.priority);

    return decisions;
  }

  /**
   * Evaluate a single finding and produce a decision.
   * Returns null if finding should be completely ignored (recently notified, quiet hours, etc.)
   */
  private evaluateFinding(finding: SenseFinding, report: SenseReport): ThinkDecision | null {
    // ── Base priority from severity ──
    let priority = SEVERITY_PRIORITY[finding.severity] || 20;

    // ── Escalation: repeated findings get higher priority ──
    const cooldown = this.cooldowns.get(finding.key);
    if (cooldown) {
      // Each consecutive occurrence adds 5 priority (max +20)
      const escalation = Math.min(20, cooldown.consecutiveCount * 5);
      priority += escalation;
    }

    // ── Context adjustments ──
    // Disk critical > 95% → boost to 100
    if (finding.key.startsWith("disk_critical") && (finding.value ?? 0) > 95) {
      priority = 100;
    }
    // OOM killer → always max priority
    if (finding.key === "dmesg_oom") {
      priority = 100;
    }

    // Cap at 100
    priority = Math.min(100, priority);

    // ── Determine action type ──
    let action: ActionType = "log_only";
    let fixCommand: string | undefined;

    // Check if this is auto-fixable
    for (const [pattern, cmd] of Object.entries(AUTO_FIX_REGISTRY)) {
      if (finding.key.includes(pattern) || finding.key === pattern) {
        action = "auto_fix";
        fixCommand = cmd;
        break;
      }
    }

    // Critical/warning with no auto-fix → notify
    if (action === "log_only" && finding.severity !== "info") {
      action = "notify";
    }

    // ── Apply cooldown filter ──
    if (action === "notify" || action === "auto_fix") {
      if (this.isOnCooldown(finding.key)) {
        // Downgrade to log_only (still track but don't spam)
        action = "log_only";
      }
    }

    // ── Apply quiet hours ──
    if (action === "notify" && this.isQuietHours()) {
      // During quiet hours, only critical gets through
      if (finding.severity !== "critical") {
        action = "log_only";
      }
    }

    // ── Apply daily limit ──
    if (action === "notify" && this.todayMessageCount >= this.config.dailyMessageLimit) {
      action = "log_only";
    }

    // ── Build payload message ──
    const payload = this.buildPayloadMessage(finding, action);

    return {
      findingKey: finding.key,
      senseId: report.senseId,
      priority,
      action,
      payload,
      fixCommand,
      finding,
    };
  }

  /**
   * Build the notification message for a finding.
   */
  private buildPayloadMessage(finding: SenseFinding, action: ActionType): string {
    const prefix = action === "auto_fix" ? "🔧 Otomatik düzeltildi" : "⚡";
    return `${prefix} ${finding.summary}`;
  }

  // ─── COOLDOWN MANAGEMENT ──────────────────────────────────

  /**
   * Check if a finding key is currently on cooldown.
   */
  isOnCooldown(key: string): boolean {
    const entry = this.cooldowns.get(key);
    if (!entry) return false;
    return (Date.now() - entry.lastNotifiedAt) < this.config.cooldownMs;
  }

  /**
   * Record that a notification was sent for this key.
   * Must be called AFTER the notification is actually sent.
   */
  recordNotification(key: string): void {
    const existing = this.cooldowns.get(key);
    this.cooldowns.set(key, {
      key,
      lastNotifiedAt: Date.now(),
      consecutiveCount: (existing?.consecutiveCount ?? 0) + 1,
    });
    this.todayMessageCount++;
  }

  /**
   * Clear cooldown for a key (e.g., when issue is resolved).
   */
  clearCooldown(key: string): void {
    this.cooldowns.delete(key);
  }

  /**
   * Clear all cooldowns for findings that are no longer active.
   * Called after each tick to reset consecutive count for resolved issues.
   */
  clearResolvedCooldowns(activeKeys: Set<string>): void {
    for (const [key, entry] of this.cooldowns) {
      if (!activeKeys.has(key)) {
        // Issue resolved — reset consecutive count
        this.cooldowns.delete(key);
      }
    }
  }

  // ─── QUIET HOURS ──────────────────────────────────────────

  /**
   * Check if current time is within quiet hours.
   */
  isQuietHours(now?: Date): boolean {
    const date = now ?? new Date();
    const hour = date.getHours();
    const { start, end } = this.config.quietHours;

    if (start < end) {
      // e.g., 0-8: quiet from midnight to 8am
      return hour >= start && hour < end;
    } else {
      // e.g., 23-7: quiet from 11pm to 7am (wraps midnight)
      return hour >= start || hour < end;
    }
  }

  // ─── DAILY COUNTER ────────────────────────────────────────

  private resetDailyCounterIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    if (today !== this.todayDate) {
      this.todayDate = today;
      this.todayMessageCount = 0;
    }
  }

  // ─── SERIALIZATION ────────────────────────────────────────

  /**
   * Export state for persistence.
   */
  exportState(): { cooldowns: CooldownEntry[]; todayMessageCount: number; todayDate: string } {
    return {
      cooldowns: [...this.cooldowns.values()],
      todayMessageCount: this.todayMessageCount,
      todayDate: this.todayDate,
    };
  }

  /**
   * Import state from persistence.
   */
  importState(state: { cooldowns?: CooldownEntry[]; todayMessageCount?: number; todayDate?: string }): void {
    if (state.cooldowns) {
      this.cooldowns.clear();
      for (const entry of state.cooldowns) {
        this.cooldowns.set(entry.key, entry);
      }
    }
    if (state.todayDate) this.todayDate = state.todayDate;
    if (typeof state.todayMessageCount === "number") this.todayMessageCount = state.todayMessageCount;
  }

  /**
   * Get current stats for debugging/monitoring.
   */
  getStats(): { cooldownCount: number; todayMessages: number; dailyLimit: number; isQuiet: boolean } {
    return {
      cooldownCount: this.cooldowns.size,
      todayMessages: this.todayMessageCount,
      dailyLimit: this.config.dailyMessageLimit,
      isQuiet: this.isQuietHours(),
    };
  }
}
