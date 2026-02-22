/**
 * FOREMAN — Interactive Confirm Engine
 *
 * Mid-pipeline approval/rejection for sensitive operations.
 * Allows user to confirm, skip, or abort during forge execution.
 *
 * OpenClaw'dan alınan: exec-approvals.ts concept
 * Foreman farkı: Pipeline-aware, atom-level granularity, TTY + messaging support
 *
 * Capabilities:
 * - Pre-write confirmation (show diff before writing)
 * - Pre-command confirmation (dangerous commands)
 * - Atom skip (skip current atom, continue pipeline)
 * - Block abort (abort current block, continue next)
 * - Pipeline abort (stop everything, checkpoint state)
 * - Auto-approve patterns (learned allowlist)
 * - Timeout with default action
 * - Non-TTY mode (auto-approve with logging)
 */

import { createInterface, type Interface as ReadlineInterface } from "node:readline";

// ─── TYPES ───────────────────────────────────────────────────

export type ConfirmAction = "approve" | "skip" | "abort" | "abort_block" | "modify" | "timeout";

export interface ConfirmRequest {
  type: "write_file" | "edit_file" | "run_command" | "delete_file" | "dangerous";
  description: string;
  detail?: string;
  /** File path or command */
  target: string;
  /** Diff preview if available */
  diff?: string;
  /** Risk level */
  risk: "low" | "medium" | "high" | "critical";
}

export interface ConfirmResult {
  action: ConfirmAction;
  reason?: string;
  timestamp: number;
}

export interface InteractiveConfig {
  /** Enable interactive mode (default: true if TTY) */
  enabled: boolean;
  /** Auto-approve low-risk operations */
  autoApproveLow: boolean;
  /** Auto-approve medium-risk operations */
  autoApproveMedium: boolean;
  /** Timeout for confirmation in ms (default: 30000) */
  timeoutMs: number;
  /** Default action on timeout */
  timeoutAction: ConfirmAction;
  /** Learned auto-approve patterns */
  allowPatterns: string[];
}

const DEFAULT_CONFIG: InteractiveConfig = {
  enabled: process.stdout.isTTY ?? false,
  autoApproveLow: true,
  autoApproveMedium: false,
  timeoutMs: 30_000,
  timeoutAction: "approve",
  allowPatterns: [],
};

// ─── RISK ASSESSMENT ─────────────────────────────────────────

const DANGEROUS_COMMANDS = [
  /\brm\s+-rf\b/,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b(npm|pnpm)\s+publish\b/,
  /\bgit\s+push\s+(-f|--force)\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bdropdb\b/,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\btruncate\b/i,
  /\bcurl\b.*\|\s*sh\b/,
  /\bwget\b.*\|\s*bash\b/,
];

const SENSITIVE_PATHS = [
  /^\/etc\//,
  /^\/usr\//,
  /^\/var\//,
  /^\/root\//,
  /\.env$/,
  /\.ssh\//,
  /\.gnupg\//,
  /id_rsa/,
  /\.pem$/,
  /credentials/i,
  /secrets/i,
  /password/i,
];

export function assessRisk(request: ConfirmRequest): "low" | "medium" | "high" | "critical" {
  const target = request.target;

  // Command risk assessment
  if (request.type === "run_command") {
    if (DANGEROUS_COMMANDS.some(rx => rx.test(target))) return "critical";
    if (/\bsudo\b/.test(target)) return "critical";
    if (/\brm\b/.test(target)) return "high";
    if (/\bgit\s+(push|merge|rebase|reset)\b/.test(target)) return "medium";
    if (/\b(npm|pnpm|yarn)\s+install\b/.test(target)) return "low";
    return "medium";
  }

  // File operation risk
  if (request.type === "delete_file") {
    if (SENSITIVE_PATHS.some(rx => rx.test(target))) return "critical";
    return "high";
  }

  if (request.type === "write_file" || request.type === "edit_file") {
    if (SENSITIVE_PATHS.some(rx => rx.test(target))) return "high";
    if (/\.(ts|js|py|rs|go|java|c|cpp|h)$/.test(target)) return "low";
    if (/\.(json|yaml|yml|toml)$/.test(target)) return "medium";
    return "low";
  }

  return request.risk;
}

// ─── INTERACTIVE CONFIRM ENGINE ──────────────────────────────

export class InteractiveConfirm {
  private config: InteractiveConfig;
  private history: ConfirmResult[] = [];
  private rl: ReadlineInterface | null = null;

  constructor(config?: Partial<InteractiveConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if interactive mode is available (TTY attached).
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Request confirmation for an operation.
   * Returns the user's decision.
   */
  async confirm(request: ConfirmRequest): Promise<ConfirmResult> {
    const risk = assessRisk(request);
    const req = { ...request, risk };

    // Check auto-approve
    if (this.shouldAutoApprove(req)) {
      const result: ConfirmResult = { action: "approve", reason: "auto-approved", timestamp: Date.now() };
      this.history.push(result);
      return result;
    }

    // Non-interactive mode
    if (!this.config.enabled) {
      const result: ConfirmResult = {
        action: risk === "critical" ? "skip" : "approve",
        reason: `non-interactive (risk: ${risk})`,
        timestamp: Date.now(),
      };
      this.history.push(result);
      return result;
    }

    // Interactive TTY confirmation
    return this.promptUser(req);
  }

  /**
   * Confirm a batch of operations at once.
   */
  async confirmBatch(requests: ConfirmRequest[]): Promise<Map<number, ConfirmResult>> {
    const results = new Map<number, ConfirmResult>();
    for (let i = 0; i < requests.length; i++) {
      const result = await this.confirm(requests[i]);
      results.set(i, result);
      if (result.action === "abort") break;
    }
    return results;
  }

  /**
   * Get confirmation history.
   */
  getHistory(): readonly ConfirmResult[] {
    return this.history;
  }

  /**
   * Get stats.
   */
  getStats(): { approved: number; skipped: number; aborted: number; total: number } {
    const approved = this.history.filter(r => r.action === "approve").length;
    const skipped = this.history.filter(r => r.action === "skip").length;
    const aborted = this.history.filter(r => r.action === "abort" || r.action === "abort_block").length;
    return { approved, skipped, aborted, total: this.history.length };
  }

  /**
   * Add a learned auto-approve pattern.
   */
  learn(pattern: string): void {
    if (!this.config.allowPatterns.includes(pattern)) {
      this.config.allowPatterns.push(pattern);
    }
  }

  /**
   * Close readline interface.
   */
  close(): void {
    this.rl?.close();
    this.rl = null;
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private shouldAutoApprove(request: ConfirmRequest): boolean {
    // Auto-approve by risk level
    if (request.risk === "low" && this.config.autoApproveLow) return true;
    if (request.risk === "medium" && this.config.autoApproveMedium) return true;

    // Check learned patterns
    return this.config.allowPatterns.some(pattern => {
      try {
        return new RegExp(pattern).test(request.target);
      } catch {
        return request.target.includes(pattern);
      }
    });
  }

  private async promptUser(request: ConfirmRequest): Promise<ConfirmResult> {
    const RISK_COLORS: Record<string, string> = {
      low: "\x1b[32m",
      medium: "\x1b[33m",
      high: "\x1b[38;5;208m",
      critical: "\x1b[31m\x1b[1m",
    };
    const RESET = "\x1b[0m";
    const riskColor = RISK_COLORS[request.risk] ?? "";

    // Display the request
    console.log("");
    console.log(`  ${riskColor}[${request.risk.toUpperCase()}]${RESET} ${request.description}`);
    console.log(`  Target: ${request.target}`);
    if (request.diff) {
      console.log(`  Diff:`);
      for (const line of request.diff.split("\n").slice(0, 15)) {
        const color = line.startsWith("+") ? "\x1b[32m" : line.startsWith("-") ? "\x1b[31m" : "\x1b[90m";
        console.log(`    ${color}${line}${RESET}`);
      }
    }
    console.log(`  [y] Approve  [n] Skip  [a] Abort pipeline  [b] Abort block`);

    return new Promise<ConfirmResult>((resolve) => {
      if (!this.rl) {
        this.rl = createInterface({ input: process.stdin, output: process.stdout });
      }

      const timer = setTimeout(() => {
        console.log(`  ⏱️ Timeout — ${this.config.timeoutAction}`);
        resolve({ action: this.config.timeoutAction, reason: "timeout", timestamp: Date.now() });
      }, this.config.timeoutMs);
      timer.unref();

      this.rl.question("  > ", (answer) => {
        clearTimeout(timer);
        const a = answer.trim().toLowerCase();
        let action: ConfirmAction = "approve";

        switch (a) {
          case "y": case "yes": case "": action = "approve"; break;
          case "n": case "no": case "s": case "skip": action = "skip"; break;
          case "a": case "abort": action = "abort"; break;
          case "b": case "block": action = "abort_block"; break;
          default: action = "skip"; break;
        }

        const result: ConfirmResult = { action, timestamp: Date.now() };
        this.history.push(result);
        resolve(result);
      });
    });
  }
}
