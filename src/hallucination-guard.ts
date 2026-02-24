/**
 * FOREMAN — Hallucination Guard
 *
 * Hook-based guardrails that prevent hallucination at multiple points
 * in the pipeline. Integrates with HooksEngine.
 */

import type { HookEvent, HookResult } from "./hooks-engine.js";
import { analyzeGroundTruth, type GroundTruthReport } from "./ground-truth-engine.js";
import { createFactChecker, type FactCheckResult } from "./fact-checker.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface GuardConfig {
  /** Enable ground truth analysis before pipeline */
  enableGroundTruth: boolean;
  /** Validate all LLM outputs */
  validateOutputs: boolean;
  /** Block on any fact violation */
  strictMode: boolean;
  /** Inject ground truth into prompts */
  injectContext: boolean;
  /** Callback for violations */
  onViolation?: (message: string, severity: "warn" | "error") => void;
}

export interface GuardState {
  groundTruth: GroundTruthReport | null;
  violationCount: number;
  lastCheck: FactCheckResult | null;
}

// ─── GUARD IMPLEMENTATION ──────────────────────────────────────

export class HallucinationGuard {
  private projectRoot: string;
  private config: GuardConfig;
  private state: GuardState;

  constructor(projectRoot: string, config?: Partial<GuardConfig>) {
    this.projectRoot = projectRoot;
    this.config = {
      enableGroundTruth: true,
      validateOutputs: true,
      strictMode: true,
      injectContext: true,
      ...config,
    };
    this.state = {
      groundTruth: null,
      violationCount: 0,
      lastCheck: null,
    };
  }

  /**
   * Initialize the guard - call before pipeline starts.
   */
  async initialize(): Promise<void> {
    if (this.config.enableGroundTruth) {
      this.state.groundTruth = await analyzeGroundTruth(this.projectRoot);
    }
  }

  /**
   * Hook: before_pipeline
   * Injects ground truth context into the task.
   */
  async beforePipeline(event: HookEvent): Promise<HookResult> {
    if (!this.config.injectContext || !this.state.groundTruth) {
      return {};
    }

    const task = event.data.task as string;
    if (!task) return {};

    // Modify task to include ground truth context
    const contextString = this.generateGroundTruthContext();
    const enhancedTask = `${task}\n\n${contextString}`;

    return {
      modifiedData: { task: enhancedTask },
    };
  }

  /**
   * Hook: after_thought
   * Validates LLM output against ground truth.
   * Vision layer gets relaxed checking — it's exploratory, not assertive.
   */
  async afterThought(event: HookEvent): Promise<HookResult> {
    if (!this.config.validateOutputs || !this.state.groundTruth) {
      return {};
    }

    const data = event.data as { layer?: string; input?: string; output?: string; reasoning?: string };
    const content = `${data.output || ""}\n${data.reasoning || ""}`;

    if (!content.trim()) return {};

    // Vision layer is exploratory — do NOT fact-check or block
    // Vision creates plans, describes architecture, estimates scope
    // All assertions are aspirational, not factual claims
    // Real validation happens at worker/reviewer level
    const isVisionLayer = data.layer === "visioner" || data.layer === "vision";
    if (isVisionLayer) {
      return {};
    }

    const isResearchLayer = data.layer === "researcher" || data.layer === "research";

    const checker = createFactChecker(this.state.groundTruth, {
      strictCommands: this.config.strictMode,
      strictFiles: this.config.strictMode,
      strictMetrics: this.config.strictMode && !isResearchLayer,
      strictLinks: this.config.strictMode,
    });

    const result = checker.check(content);
    this.state.lastCheck = result;

    if (!result.valid) {
      this.state.violationCount += result.violations.length;

      if (this.config.strictMode) {
        // Generate feedback for retry
        const feedback = checker.generateFeedback(result);
        this.config.onViolation?.(`${data.layer} hallucination: ${result.violations[0].reason}`, "error");

        return {
          block: true,
          blockReason: `Hallucination detected in ${data.layer} output. ${result.violations.length} fact violations found.`,
          modifiedData: {
            // Attach feedback for retry mechanism
            _hallucinationFeedback: feedback,
            _violations: result.violations,
          },
        };
      }
    }

    return {};
  }

  /**
   * Hook: before_file_write
   * Validates file content before writing.
   */
  async beforeFileWrite(event: HookEvent): Promise<HookResult> {
    if (!this.config.validateOutputs || !this.state.groundTruth) {
      return {};
    }

    const data = event.data as { path?: string; content?: string };
    const filePath = data.path || "";
    const content = data.content || "";

    // Only check markdown/documentation files
    if (!filePath.endsWith(".md") && !filePath.endsWith(".MD")) {
      return {};
    }

    const checker = createFactChecker(this.state.groundTruth);
    const result = checker.check(content);

    if (!result.valid) {
      this.state.violationCount += result.violations.length;

      if (this.config.strictMode) {
        const feedback = checker.generateFeedback(result);
        console.error("\n" + feedback);

        return {
          block: true,
          blockReason: `Hallucination detected in ${filePath}. Fix the content before writing.`,
        };
      }
    }

    return {};
  }

  /**
   * Hook: before_command
   * Validates shell commands against ground truth.
   */
  async beforeCommand(event: HookEvent): Promise<HookResult> {
    if (!this.config.strictMode || !this.state.groundTruth) {
      return {};
    }

    const data = event.data as { command?: string };
    const command = data.command || "";

    if (!command.trim()) return {};

    // Check for hallucinated commands
    const gt = this.state.groundTruth;

    // Extract command name (first word before space)
    const cmdName = command.trim().split(/\s+/)[0];

    // Check if it's a package manager command with potentially wrong package
    if (cmdName === "npm" || cmdName === "yarn" || cmdName === "pnpm") {
      // Check for npm install -g (common hallucination)
      if (command.includes("install -g") || command.includes("i -g")) {
        // Check if package is actually published
        const match = command.match(/install\s+-g\s+(\S+)/);
        if (match) {
          const pkg = match[1];
          // Check if this package exists in our dependencies
          const deps = gt.packageJson.parsed?.dependencies || {};
          const devDeps = gt.packageJson.parsed?.devDependencies || {};
          const isLocalDep = Object.prototype.hasOwnProperty.call(deps, pkg);
          const isDevDep = Object.prototype.hasOwnProperty.call(devDeps, pkg);

          if (!isLocalDep && !isDevDep) {
            this.state.violationCount++;
            return {
              block: true,
              blockReason: `Potentially hallucinated global install: ${pkg}. This package is not in project dependencies. Use local install (npm install ${pkg}) or verify package exists on npm.`,
            };
          }
        }
      }
    }

    // Check for non-existent npm scripts
    if (command.startsWith("npm run ") || command.startsWith("yarn ")) {
      const scriptMatch = command.match(/(?:npm run|yarn)\s+(\S+)/);
      if (scriptMatch) {
        const scriptName = scriptMatch[1];
        const scriptExists = gt.availableCommands.some(c =>
          c.name === scriptName && c.source === "package.json"
        );

        if (!scriptExists) {
          const availableScripts = gt.availableCommands
            .filter(c => c.source === "package.json")
            .map(c => c.name)
            .join(", ");
          this.state.violationCount++;
          return {
            block: true,
            blockReason: `Hallucinated npm script: "${scriptName}" does not exist in package.json scripts. Available scripts: ${availableScripts || "none"}`,
          };
        }
      }
    }

    return {};
  }

  /**
   * Hook: after_pipeline
   * Reports on hallucination statistics.
   */
  async afterPipeline(event: HookEvent): Promise<HookResult> {
    if (this.state.violationCount > 0) {
      console.log(`\n⚠️  Hallucination Guard: ${this.state.violationCount} total violations caught`);
    }
    return {};
  }

  /**
   * Get current guard state.
   */
  getState(): GuardState {
    return { ...this.state };
  }

  /**
   * Get ground truth report.
   */
  getGroundTruth(): GroundTruthReport | null {
    return this.state.groundTruth;
  }

  private generateGroundTruthContext(): string {
    if (!this.state.groundTruth) return "";

    const gt = this.state.groundTruth;
    const lines: string[] = [];

    lines.push("---");
    lines.push("GROUND TRUTH (Verified Facts from Codebase):");
    lines.push("");

    // Installation
    lines.push("INSTALLATION:");
    lines.push(gt.installation.installCommand);
    lines.push("");

    // Commands
    lines.push("COMMANDS:");
    const realCommands = gt.availableCommands
      .filter((c) => c.exists)
      .slice(0, 5)
      .map((c) => `- ${c.name}`);
    lines.push(...realCommands);
    lines.push("");

    // Structure
    lines.push("STRUCTURE:");
    lines.push(`- ${gt.structure.sourceFiles} source files`);
    lines.push(`- ${gt.structure.testFiles} test files`);
    if (gt.structure.testPattern) {
      lines.push(`- Test pattern: ${gt.structure.testPattern}`);
    }
    lines.push("");

    // Constraints
    lines.push("CONSTRAINTS:");
    lines.push("- DO NOT suggest npm install -g (not published)");
    lines.push("- DO NOT invent commands - use only listed ones");
    lines.push("- DO NOT claim specific performance metrics");
    lines.push("- DO NOT use placeholder URLs");
    lines.push("---");

    return lines.join("\n");
  }
}

// ─── HOOK REGISTRATION HELPERS ─────────────────────────────────

/**
 * Register hallucination guard hooks with a HooksEngine.
 */
export function registerHallucinationGuard(
  hooksEngine: { register: (hookName: import("./hooks-engine.js").HookName, handler: import("./hooks-engine.js").HookHandler, options?: { name?: string; priority?: number; catchErrors?: boolean }) => () => void },
  projectRoot: string,
  config?: Partial<GuardConfig>
): HallucinationGuard {
  const guard = new HallucinationGuard(projectRoot, config);

  // Register hooks
  hooksEngine.register("before_pipeline", guard.beforePipeline.bind(guard), {
    name: "hallucination-guard-init",
    priority: 100, // High priority - run early
  });

  hooksEngine.register("after_thought", guard.afterThought.bind(guard), {
    name: "hallucination-guard-check",
    priority: 90,
  });

  hooksEngine.register("before_file_write", guard.beforeFileWrite.bind(guard), {
    name: "hallucination-guard-files",
    priority: 80,
  });

  hooksEngine.register("before_command", guard.beforeCommand.bind(guard), {
    name: "hallucination-guard-commands",
    priority: 85,
  });

  hooksEngine.register("after_pipeline", guard.afterPipeline.bind(guard), {
    name: "hallucination-guard-report",
    priority: 10,
  });

  return guard;
}

// ─── STANDALONE CHECK ──────────────────────────────────────────

export async function checkForHallucinations(
  content: string,
  projectRoot: string
): Promise<FactCheckResult> {
  const truth = await analyzeGroundTruth(projectRoot);
  const checker = createFactChecker(truth);
  return checker.check(content);
}
