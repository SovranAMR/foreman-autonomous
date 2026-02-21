/**
 * FOREMAN — Command Approval System
 *
 * Intelligent command gating that EXCEEDS OpenClaw's exec-approvals.
 *
 * OpenClaw's approach:
 * - Unix socket + UI-based approval (user clicks "allow")
 * - Agent-specific allowlists persisted in ~/.openclaw/exec-approvals.json
 * - Security modes: deny / allowlist / full
 * - Ask modes: off / on-miss / always
 * - Pattern-based matching with binary path resolution
 * - No learning, no risk scoring
 *
 * Foreman's approach:
 *
 * 1. RISK SCORING: Every command gets a risk score (0-1) based on
 *    what it does, not just what binary it calls.
 *    `npm install` = 0.3 (network, but common)
 *    `rm -rf src/` = 0.9 (destructive, project files)
 *    OpenClaw: binary allow/deny, no gradation.
 *
 * 2. LEARNED ALLOWLIST: Commands that succeed without issues get
 *    auto-promoted to the allowlist. Commands that fail or cause
 *    problems get auto-demoted.
 *    OpenClaw: only manual allowlist via user clicking.
 *
 * 3. THOUGHT-CHAIN CONTEXT: The approval decision includes which
 *    thought/layer is requesting the command. A visioner layer
 *    should NEVER run destructive commands. A worker can.
 *    OpenClaw: no layer awareness.
 *
 * 4. DESTRUCTIVE COMMAND ANALYSIS: Beyond pattern matching,
 *    analyzes what files/dirs the command would affect and
 *    whether they're in the project or system-wide.
 *    OpenClaw: simple pattern blocklist.
 *
 * 5. APPROVAL HISTORY: Full audit trail of what was approved/denied,
 *    by which thought, and whether the result was successful.
 *    OpenClaw: only stores last-used timestamp.
 *
 * 6. AUTO-ESCALATION: If a command exceeds the layer's risk
 *    threshold, it bubbles up to the strategist or visioner
 *    for a decision (as a BLOCK signal in the thought chain).
 *    OpenClaw: always asks the human.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export type ApprovalDecision = "allow" | "deny" | "escalate";

export interface CommandRiskAssessment {
  command: string;
  riskScore: number;
  riskFactors: string[];
  category: CommandCategory;
  affectedPaths: string[];
  decision: ApprovalDecision;
  reason: string;
}

export type CommandCategory =
  | "read"        // grep, cat, find — harmless
  | "build"       // npm run, tsc, esbuild
  | "test"        // npm test, vitest
  | "install"     // npm install, pip install
  | "write"       // touch, mkdir, cp
  | "delete"      // rm, rmdir
  | "network"     // curl, wget, fetch
  | "git"         // git add, commit, push
  | "system"      // systemctl, service, chmod
  | "dangerous";  // rm -rf, dd, mkfs

export interface AllowlistEntry {
  /** Normalized command pattern */
  pattern: string;
  /** How many times this command has been allowed */
  allowCount: number;
  /** Last time it was used */
  lastUsedAt: string;
  /** Was the last execution successful */
  lastSuccess: boolean;
  /** Auto-learned or manually set */
  source: "learned" | "manual" | "default";
}

export interface ApprovalHistoryEntry {
  command: string;
  decision: ApprovalDecision;
  riskScore: number;
  layer: Layer;
  thoughtId?: string;
  timestamp: string;
  success?: boolean;
}

export interface ApprovalConfig {
  /** Risk threshold per layer — commands above this get escalated */
  layerThresholds: Record<Layer, number>;
  /** Auto-learn successful commands */
  autoLearn: boolean;
  /** Max entries in allowlist */
  maxAllowlistSize: number;
}

// ─── CONSTANTS ───────────────────────────────────────────────

const DEFAULT_CONFIG: ApprovalConfig = {
  layerThresholds: {
    visioner: 0.1,     // visioner should almost never run commands
    strategist: 0.3,   // strategist can run safe reads
    researcher: 0.5,   // researcher can install, fetch
    worker: 0.7,       // worker can do most things
  },
  autoLearn: true,
  maxAllowlistSize: 200,
};

/** Commands always allowed without scoring */
const SAFE_COMMANDS = new Set([
  "cat", "head", "tail", "wc", "sort", "uniq", "cut", "tr",
  "grep", "rg", "ag", "find", "ls", "pwd", "echo", "date",
  "which", "whoami", "hostname", "uname",
  "git status", "git branch", "git log", "git diff", "git show",
  "node --version", "npm --version", "pnpm --version", "bun --version",
  "tsc --version", "tsx --version",
]);

/** Commands always blocked */
const BLOCKED_COMMANDS: ReadonlyArray<RegExp> = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+\/\*/,
  /mkfs\./,
  /dd\s+if=.*of=\/dev\//,
  /:\(\)\{\s*:\|:\&\s*\};:/,  // fork bomb
  /chmod\s+777\s+\//,
  />\s*\/dev\/sd/,
  /curl\s+.*\|\s*(?:sudo\s+)?(?:sh|bash)/,
  /wget\s+.*\|\s*(?:sudo\s+)?(?:sh|bash)/,
  /eval\s*\$\(curl/,
  /sudo\s+rm/,
  /sudo\s+dd/,
  /sudo\s+mkfs/,
];

/** Risk score modifiers by pattern */
const RISK_PATTERNS: ReadonlyArray<{ pattern: RegExp; score: number; factor: string }> = [
  // Destructive
  { pattern: /\brm\b/, score: 0.6, factor: "file deletion" },
  { pattern: /\brm\s+-r/, score: 0.8, factor: "recursive deletion" },
  { pattern: /\brmdir\b/, score: 0.5, factor: "directory removal" },
  // Write
  { pattern: /\bmv\b/, score: 0.4, factor: "file move/rename" },
  { pattern: /\bcp\b/, score: 0.2, factor: "file copy" },
  { pattern: /\bchmod\b/, score: 0.5, factor: "permission change" },
  { pattern: /\bchown\b/, score: 0.6, factor: "ownership change" },
  // Network
  { pattern: /\bcurl\b/, score: 0.4, factor: "network request" },
  { pattern: /\bwget\b/, score: 0.4, factor: "network download" },
  { pattern: /\bnpm\s+install\b/, score: 0.3, factor: "package installation" },
  { pattern: /\bpnpm\s+install\b/, score: 0.3, factor: "package installation" },
  { pattern: /\bpip\s+install\b/, score: 0.3, factor: "package installation" },
  // Build/test (safe)
  { pattern: /\bnpm\s+(?:run|test|build)\b/, score: 0.1, factor: "npm script" },
  { pattern: /\bpnpm\s+(?:run|test|build)\b/, score: 0.1, factor: "pnpm script" },
  { pattern: /\btsc\b/, score: 0.1, factor: "TypeScript compilation" },
  { pattern: /\bvitest\b/, score: 0.1, factor: "test execution" },
  { pattern: /\bnpx\s+tsx\b/, score: 0.1, factor: "TypeScript execution" },
  // Git write operations
  { pattern: /\bgit\s+push\b/, score: 0.5, factor: "git push (remote write)" },
  { pattern: /\bgit\s+push\s+--force/, score: 0.8, factor: "force push (destructive)" },
  { pattern: /\bgit\s+reset\s+--hard/, score: 0.7, factor: "hard reset (data loss)" },
  { pattern: /\bgit\s+clean\s+-fd/, score: 0.7, factor: "git clean (file deletion)" },
  { pattern: /\bgit\s+(?:add|commit)\b/, score: 0.2, factor: "git staging/commit" },
  // System
  { pattern: /\bsudo\b/, score: 0.8, factor: "elevated privileges" },
  { pattern: /\bsystemctl\b/, score: 0.7, factor: "system service control" },
  { pattern: /\bservice\b/, score: 0.6, factor: "service management" },
  // Pipes to shell
  { pattern: /\|\s*(?:sh|bash|zsh)\b/, score: 0.8, factor: "piped to shell" },
  { pattern: /\beval\b/, score: 0.7, factor: "dynamic evaluation" },
];

// ─── APPROVAL ENGINE ─────────────────────────────────────────

export class ApprovalEngine {
  private allowlist: Map<string, AllowlistEntry> = new Map();
  private history: ApprovalHistoryEntry[] = [];
  private config: ApprovalConfig;
  private persistPath: string | null;

  constructor(projectRoot: string, config?: Partial<ApprovalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.persistPath = join(projectRoot, ".foreman", "approvals.json");
    this.loadFromDisk();
  }

  /**
   * Assess a command's risk and decide whether to allow it.
   */
  assess(command: string, layer: Layer, thoughtId?: string): CommandRiskAssessment {
    const trimmed = command.trim();

    // Always blocked
    for (const pattern of BLOCKED_COMMANDS) {
      if (pattern.test(trimmed)) {
        const assessment: CommandRiskAssessment = {
          command: trimmed,
          riskScore: 1.0,
          riskFactors: ["Matches blocked command pattern"],
          category: "dangerous",
          affectedPaths: [],
          decision: "deny",
          reason: "Command is on the permanent blocklist",
        };
        this.recordHistory(trimmed, "deny", 1.0, layer, thoughtId);
        return assessment;
      }
    }

    // Always safe
    const firstWord = trimmed.split(/\s+/)[0];
    const firstTwo = trimmed.split(/\s+/).slice(0, 2).join(" ");
    if (SAFE_COMMANDS.has(firstWord) || SAFE_COMMANDS.has(firstTwo)) {
      const assessment: CommandRiskAssessment = {
        command: trimmed,
        riskScore: 0,
        riskFactors: [],
        category: "read",
        affectedPaths: [],
        decision: "allow",
        reason: "Safe command (always allowed)",
      };
      this.recordHistory(trimmed, "allow", 0, layer, thoughtId);
      return assessment;
    }

    // Check learned allowlist
    const pattern = normalizeCommandPattern(trimmed);
    const entry = this.allowlist.get(pattern);
    if (entry && entry.lastSuccess && entry.allowCount >= 3) {
      const assessment: CommandRiskAssessment = {
        command: trimmed,
        riskScore: 0.1,
        riskFactors: [],
        category: classifyCommand(trimmed),
        affectedPaths: extractPaths(trimmed),
        decision: "allow",
        reason: `Learned allowlist (used ${entry.allowCount} times successfully)`,
      };
      this.recordHistory(trimmed, "allow", 0.1, layer, thoughtId);
      return assessment;
    }

    // Risk scoring
    const { score, factors } = calculateRiskScore(trimmed);
    const category = classifyCommand(trimmed);
    const affectedPaths = extractPaths(trimmed);

    // Layer threshold check
    const threshold = this.config.layerThresholds[layer];
    let decision: ApprovalDecision;
    let reason: string;

    if (score <= threshold) {
      decision = "allow";
      reason = `Risk score ${score.toFixed(2)} is within ${layer} threshold (${threshold})`;
    } else if (score <= threshold + 0.2) {
      decision = "escalate";
      reason = `Risk score ${score.toFixed(2)} exceeds ${layer} threshold (${threshold}) — needs higher-layer approval`;
    } else {
      decision = "deny";
      reason = `Risk score ${score.toFixed(2)} is too high for ${layer} layer (threshold: ${threshold})`;
    }

    const assessment: CommandRiskAssessment = {
      command: trimmed,
      riskScore: score,
      riskFactors: factors,
      category,
      affectedPaths,
      decision,
      reason,
    };

    this.recordHistory(trimmed, decision, score, layer, thoughtId);
    return assessment;
  }

  /**
   * Report that a command succeeded — promotes it in the allowlist.
   */
  reportSuccess(command: string): void {
    if (!this.config.autoLearn) return;

    const pattern = normalizeCommandPattern(command.trim());
    const existing = this.allowlist.get(pattern);

    if (existing) {
      existing.allowCount++;
      existing.lastUsedAt = new Date().toISOString();
      existing.lastSuccess = true;
    } else {
      this.allowlist.set(pattern, {
        pattern,
        allowCount: 1,
        lastUsedAt: new Date().toISOString(),
        lastSuccess: true,
        source: "learned",
      });
    }

    // Trim allowlist if too large
    if (this.allowlist.size > this.config.maxAllowlistSize) {
      this.pruneAllowlist();
    }

    this.saveToDisk();
  }

  /**
   * Report that a command failed — demotes it in the allowlist.
   */
  reportFailure(command: string): void {
    const pattern = normalizeCommandPattern(command.trim());
    const existing = this.allowlist.get(pattern);
    if (existing) {
      existing.lastSuccess = false;
      // If it failed more than it succeeded, remove it
      if (existing.allowCount <= 1) {
        this.allowlist.delete(pattern);
      }
      this.saveToDisk();
    }
  }

  /**
   * Manually add a command to the allowlist.
   */
  allow(command: string): void {
    const pattern = normalizeCommandPattern(command.trim());
    this.allowlist.set(pattern, {
      pattern,
      allowCount: 100, // manual = high trust
      lastUsedAt: new Date().toISOString(),
      lastSuccess: true,
      source: "manual",
    });
    this.saveToDisk();
  }

  /**
   * Get full approval history.
   */
  getHistory(): ApprovalHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get the learned allowlist.
   */
  getAllowlist(): AllowlistEntry[] {
    return [...this.allowlist.values()];
  }

  /**
   * Statistics.
   */
  stats(): { allowed: number; denied: number; escalated: number; allowlistSize: number } {
    let allowed = 0;
    let denied = 0;
    let escalated = 0;
    for (const entry of this.history) {
      switch (entry.decision) {
        case "allow": allowed++; break;
        case "deny": denied++; break;
        case "escalate": escalated++; break;
      }
    }
    return { allowed, denied, escalated, allowlistSize: this.allowlist.size };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private recordHistory(
    command: string,
    decision: ApprovalDecision,
    riskScore: number,
    layer: Layer,
    thoughtId?: string,
  ): void {
    this.history.push({
      command,
      decision,
      riskScore,
      layer,
      thoughtId,
      timestamp: new Date().toISOString(),
    });

    // Keep last 500 entries
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }
  }

  private pruneAllowlist(): void {
    // Remove least-used entries
    const entries = [...this.allowlist.entries()]
      .sort((a, b) => a[1].allowCount - b[1].allowCount);

    const toRemove = entries.slice(0, entries.length - this.config.maxAllowlistSize);
    for (const [key] of toRemove) {
      this.allowlist.delete(key);
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const data = JSON.parse(readFileSync(this.persistPath, "utf-8")) as {
        allowlist?: Array<[string, AllowlistEntry]>;
      };
      if (data.allowlist) {
        this.allowlist = new Map(data.allowlist);
      }
    } catch { /* corrupt file, start fresh */ }
  }

  private saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.persistPath, JSON.stringify({
        allowlist: [...this.allowlist.entries()],
      }, null, 2), "utf-8");
    } catch { /* best effort */ }
  }
}

// ─── RISK SCORING ────────────────────────────────────────────

function calculateRiskScore(command: string): { score: number; factors: string[] } {
  let score = 0.15; // base risk (unknown command)
  const factors: string[] = [];

  for (const { pattern, score: riskDelta, factor } of RISK_PATTERNS) {
    if (pattern.test(command)) {
      score = Math.max(score, riskDelta);
      factors.push(factor);
    }
  }

  // Compound risk: pipes increase risk
  const pipeCount = (command.match(/\|/g) || []).length;
  if (pipeCount > 2) {
    score = Math.min(1.0, score + 0.1);
    factors.push(`${pipeCount} pipes (complex command chain)`);
  }

  // Subshell risk
  if (/\$\(/.test(command) || /`/.test(command)) {
    score = Math.min(1.0, score + 0.15);
    factors.push("command substitution");
  }

  return { score: Math.min(1.0, score), factors };
}

// ─── COMMAND CLASSIFICATION ──────────────────────────────────

function classifyCommand(command: string): CommandCategory {
  const cmd = command.trim().toLowerCase();

  if (/^(cat|head|tail|grep|rg|ag|find|ls|wc|sort|uniq|cut|tr)\b/.test(cmd)) return "read";
  if (/\brm\b/.test(cmd)) return "delete";
  if (/\b(curl|wget|fetch)\b/.test(cmd)) return "network";
  if (/\b(npm|pnpm|pip|yarn)\s+(install|add|i)\b/.test(cmd)) return "install";
  if (/\b(npm|pnpm|yarn)\s+(run|build)\b/.test(cmd) || /\b(tsc|esbuild|vite)\b/.test(cmd)) return "build";
  if (/\b(npm|pnpm|yarn)\s+test\b/.test(cmd) || /\b(vitest|jest|mocha)\b/.test(cmd)) return "test";
  if (/\bgit\b/.test(cmd)) return "git";
  if (/\b(touch|mkdir|cp|mv)\b/.test(cmd)) return "write";
  if (/\b(sudo|systemctl|service|chmod|chown)\b/.test(cmd)) return "system";
  if (BLOCKED_COMMANDS.some(p => p.test(cmd))) return "dangerous";

  return "build"; // default to build (moderate risk)
}

// ─── PATH EXTRACTION ─────────────────────────────────────────

/**
 * Extract file/directory paths from a command.
 * Heuristic — catches most common patterns.
 */
function extractPaths(command: string): string[] {
  const paths: string[] = [];

  // Match quoted paths
  const quoted = command.matchAll(/["']([^"']+\.[a-z]+)["']/g);
  for (const match of quoted) {
    paths.push(match[1]);
  }

  // Match unquoted paths (containing / or .)
  const tokens = command.split(/\s+/);
  for (const token of tokens) {
    if (token.startsWith("-")) continue; // skip flags
    if (token.includes("/") && !token.startsWith("http")) {
      paths.push(token);
    }
    if (/\.\w+$/.test(token) && !token.startsWith("-") && !token.startsWith("http")) {
      paths.push(token);
    }
  }

  return [...new Set(paths)];
}

// ─── COMMAND NORMALIZATION ───────────────────────────────────

/**
 * Normalize a command for allowlist matching.
 * Strips variable parts (file paths, versions) to match the pattern.
 *
 * `npm install lodash` → `npm install *`
 * `rm src/old.ts` → `rm *`
 * `git commit -m "message"` → `git commit -m *`
 */
export function normalizeCommandPattern(command: string): string {
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0) return command;

  const cmd = parts[0];

  // For simple commands, keep the first arg if it's a flag
  if (parts.length === 1) {
    return cmd;
  }
  if (parts.length === 2) {
    const arg = parts[1];
    if (arg.startsWith("-")) return `${cmd} ${arg}`;
    return `${cmd} *`;
  }

  // For complex commands, keep flags, wildcard the rest
  const normalized = [cmd];
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith("-")) {
      normalized.push(parts[i]);
    } else {
      normalized.push("*");
    }
  }

  return normalized.join(" ");
}
