/**
 * FOREMAN — Fact Checker
 *
 * Validates LLM-generated content against verified ground truth.
 * Blocks hallucinations before they reach the user.
 */

import type { GroundTruthReport, VerifiedCommand } from "./ground-truth-engine.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface FactViolation {
  /** Type of violation */
  type: "command" | "file" | "metric" | "link" | "claim";
  /** The false statement */
  statement: string;
  /** Why it's wrong */
  reason: string;
  /** Suggested correction */
  correction?: string;
  /** Severity */
  severity: "error" | "warning";
}

export interface FactCheckResult {
  /** Whether content passed all checks */
  valid: boolean;
  /** List of violations found */
  violations: FactViolation[];
  /** Corrected content (if applicable) */
  corrected?: string;
}

export interface FactCheckConfig {
  /** Block on any command that doesn't exist */
  strictCommands: boolean;
  /** Block on file references that don't exist */
  strictFiles: boolean;
  /** Block on unverified metrics */
  strictMetrics: boolean;
  /** Block on placeholder URLs */
  strictLinks: boolean;
}

// ─── PATTERNS ──────────────────────────────────────────────────

// Patterns that indicate hallucinated commands
const HALLUCINATED_COMMAND_PATTERNS = [
  // npm install -g when not published
  { pattern: /npm\s+install\s+-g\s+(\w+)/, type: "command", check: "npmGlobal" },
  // npx <package> when not verified
  { pattern: /npx\s+(-y\s+)?(\w+)/, type: "command", check: "npx" },
  // foreman <command> - verify against actual commands
  { pattern: /foreman\s+(\w+)/, type: "command", check: "foreman" },
  // yarn global add
  { pattern: /yarn\s+global\s+add\s+(\w+)/, type: "command", check: "yarnGlobal" },
  // pnpm add -g
  { pattern: /pnpm\s+add\s+-g\s+(\w+)/, type: "command", check: "pnpmGlobal" },
];

// Patterns for fake metrics
const FAKE_METRIC_PATTERNS = [
  // Time estimates like "4m 32s" or "~2 hours"
  { pattern: /\d+m\s+\d+s/, type: "metric", reason: "Unverified time estimate" },
  { pattern: /~?\d+\s*(hours?|hrs?|minutes?|mins?)/, type: "metric", reason: "Unverified duration" },
  // Cost estimates like "$0.47" or "~$1.23"
  { pattern: /\$\d+\.\d{2}/, type: "metric", reason: "Unverified cost estimate" },
  // Performance numbers without source
  { pattern: /\d+%\s+faster/, type: "metric", reason: "Unverified performance claim" },
  { pattern: /\d+x\s+(speedup|improvement)/, type: "metric", reason: "Unverified speedup claim" },
];

// Placeholder patterns
const PLACEHOLDER_PATTERNS = [
  { pattern: /github\.com\/\w+\/xxx/i, type: "link", reason: "Placeholder URL" },
  { pattern: /github\.com\/\w+\/your-repo/i, type: "link", reason: "Placeholder URL" },
  { pattern: /example\.com/, type: "link", reason: "Example URL" },
  { pattern: /\(coming soon\)/i, type: "claim", reason: "Placeholder claim" },
  { pattern: /placeholder/i, type: "claim", reason: "Explicit placeholder" },
  { pattern: /TODO:/i, type: "claim", reason: "TODO marker" },
  { pattern: /FIXME:/i, type: "claim", reason: "FIXME marker" },
];

// ─── CHECKER ───────────────────────────────────────────────────

export class FactChecker {
  private truth: GroundTruthReport;
  private config: FactCheckConfig;

  constructor(truth: GroundTruthReport, config?: Partial<FactCheckConfig>) {
    this.truth = truth;
    this.config = {
      strictCommands: true,
      strictFiles: true,
      strictMetrics: true,
      strictLinks: true,
      ...config,
    };
  }

  /**
   * Validate content against ground truth.
   */
  check(content: string): FactCheckResult {
    const violations: FactViolation[] = [];

    // Check commands
    if (this.config.strictCommands) {
      violations.push(...this.checkCommands(content));
    }

    // Check metrics
    if (this.config.strictMetrics) {
      violations.push(...this.checkMetrics(content));
    }

    // Check placeholders
    if (this.config.strictLinks) {
      violations.push(...this.checkPlaceholders(content));
    }

    // Check file references
    if (this.config.strictFiles) {
      violations.push(...this.checkFileReferences(content));
    }

    // Check specific claims
    violations.push(...this.checkSpecificClaims(content));

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  private checkCommands(content: string): FactViolation[] {
    const violations: FactViolation[] = [];

    for (const { pattern, check } of HALLUCINATED_COMMAND_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern, "g"));

      for (const match of matches) {
        const fullCommand = match[0];

        switch (check) {
          case "npmGlobal": {
            // Check if package is the current project and not published
            const pkgName = match[1];
            if (pkgName === this.truth.packageJson.parsed?.name && !this.truth.installation.isPublished) {
              violations.push({
                type: "command",
                statement: fullCommand,
                reason: `Package "${pkgName}" is not published to npm. Cannot use npm install -g.`,
                correction: this.truth.installation.installCommand,
                severity: "error",
              });
            }
            break;
          }

          case "foreman": {
            // Check if foreman command exists
            const subCommand = match[1];
            const validCommands = this.extractValidForemanCommands();

            if (!validCommands.includes(subCommand)) {
              violations.push({
                type: "command",
                statement: fullCommand,
                reason: `"foreman ${subCommand}" is not a valid command.`,
                correction: validCommands.length > 0 ? `Valid commands: ${validCommands.join(", ")}` : undefined,
                severity: "error",
              });
            }
            break;
          }

          case "npx":
          case "yarnGlobal":
          case "pnpmGlobal": {
            // Conservative: warn about global installs if not published
            if (!this.truth.installation.isPublished) {
              violations.push({
                type: "command",
                statement: fullCommand,
                reason: "Global installation commands require npm publication. Use local install instead.",
                correction: this.truth.installation.installCommand,
                severity: "warning",
              });
            }
            break;
          }
        }
      }
    }

    return violations;
  }

  private extractValidForemanCommands(): string[] {
    const commands: string[] = [];

    // Parse CLI file for commands
    // This is a simple heuristic - could be made more robust
    const cliPath = "src/cli.ts";
    const cliExists = this.truth._validation.hasFile(cliPath);

    if (cliExists) {
      // Common commands based on patterns
      commands.push("setup", "login", "init", "status", "run", "doctor");
    }

    // Also check if commands are in availableCommands
    for (const cmd of this.truth.availableCommands) {
      if (cmd.name.startsWith("foreman ") || cmd.name.startsWith("npm run ")) {
        const name = cmd.name.replace(/^foreman\s+/, "").replace(/^npm run\s+/, "");
        if (!commands.includes(name)) {
          commands.push(name);
        }
      }
    }

    return commands;
  }

  private checkMetrics(content: string): FactViolation[] {
    const violations: FactViolation[] = [];

    for (const { pattern, reason } of FAKE_METRIC_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern, "g"));

      for (const match of matches) {
        violations.push({
          type: "metric",
          statement: match[0],
          reason: `${reason}. Remove or replace with "actual measurements vary" or measured data.`,
          severity: "error",
        });
      }
    }

    return violations;
  }

  private checkPlaceholders(content: string): FactViolation[] {
    const violations: FactViolation[] = [];

    for (const { pattern, type, reason } of PLACEHOLDER_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern, "gi"));

      for (const match of matches) {
        violations.push({
          type: type as FactViolation["type"],
          statement: match[0],
          reason: reason,
          severity: "error",
        });
      }
    }

    return violations;
  }

  private checkFileReferences(content: string): FactViolation[] {
    const violations: FactViolation[] = [];

    // Pattern to match file paths in backticks or quotes
    const filePatterns = [
      /`([^`]+\.(ts|js|json|md|yml|yaml))`/g,
      /"([^"]+\.(ts|js|json|md|yml|yaml))"/g,
      /'([^']+\.(ts|js|json|md|yml|yaml))'/g,
    ];

    for (const pattern of filePatterns) {
      const matches = content.matchAll(pattern);

      for (const match of matches) {
        const filePath = match[1];

        // Skip URLs and node_modules
        if (filePath.startsWith("http") || filePath.includes("node_modules")) {
          continue;
        }

        // Check if file exists
        if (!this.truth._validation.hasFile(filePath)) {
          violations.push({
            type: "file",
            statement: filePath,
            reason: `File "${filePath}" does not exist in the project.`,
            severity: "error",
          });
        }
      }
    }

    return violations;
  }

  private checkSpecificClaims(content: string): FactViolation[] {
    const violations: FactViolation[] = [];

    // Check for "install.sh" if it doesn't exist
    if (content.includes("install.sh") && !this.truth._validation.hasFile("install.sh")) {
      violations.push({
        type: "file",
        statement: "install.sh",
        reason: "install.sh does not exist in the project.",
        severity: "error",
      });
    }

    // Check for "foreman.mjs" if that's not the actual entry
    if (content.includes("foreman.mjs")) {
      const hasMjs = this.truth.entryPoints.bin?.foreman?.path?.endsWith(".mjs") ||
                    this.truth.entryPoints.main?.path?.endsWith(".mjs");
      if (!hasMjs) {
        violations.push({
          type: "file",
          statement: "foreman.mjs",
          reason: "Entry point is not foreman.mjs. Check package.json bin/main.",
          correction: this.truth.entryPoints.bin?.foreman?.path ||
                     this.truth.entryPoints.main?.path ||
                     "See package.json for correct entry point",
          severity: "error",
        });
      }
    }

    // Check for false provider claims
    if (content.toLowerCase().includes("turkish")) {
      violations.push({
        type: "claim",
        statement: "Turkish provider",
        reason: "Antigravity is a Google service, not Turkish. Remove nationality attribution.",
        severity: "error",
      });
    }

    return violations;
  }

  /**
   * Generate a report of violations for LLM feedback.
   */
  generateFeedback(result: FactCheckResult): string {
    if (result.valid) {
      return "";
    }

    const lines: string[] = [];
    lines.push("## FACT CHECK ERRORS");
    lines.push("");
    lines.push("The following statements are NOT ACCURATE based on the actual codebase:");
    lines.push("");

    for (const v of result.violations) {
      const emoji = v.severity === "error" ? "❌" : "⚠️";
      lines.push(`${emoji} **${v.type.toUpperCase()}**: ${v.statement}`);
      lines.push(`   ${v.reason}`);
      if (v.correction) {
        lines.push(`   ✅ Correction: ${v.correction}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("Please rewrite with ONLY verified facts from the codebase.");

    return lines.join("\n");
  }
}

// ─── FACTORY ───────────────────────────────────────────────────

export function createFactChecker(truth: GroundTruthReport, config?: Partial<FactCheckConfig>): FactChecker {
  return new FactChecker(truth, config);
}

export function quickCheck(content: string, truth: GroundTruthReport): boolean {
  const checker = new FactChecker(truth);
  return checker.check(content).valid;
}
