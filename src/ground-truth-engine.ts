/**
 * FOREMAN — Ground Truth Engine
 *
 * Codebase analyzer that extracts ACTUAL facts from the project.
 * No guessing, no assumptions - only verified information.
 *
 * Used by: Verifier layer before any content generation
 * Outputs: GroundTruthReport with verified facts only
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  bin?: Record<string, string> | string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  type?: "module" | "commonjs";
  exports?: Record<string, unknown>;
}

export interface VerifiedCommand {
  name: string;
  script: string;
  source: "package.json" | "bin" | "cli.ts";
  exists: boolean;
}

export interface VerifiedEntryPoint {
  path: string;
  exists: boolean;
  type: "esm" | "cjs" | "ts" | "unknown";
}

export interface ToolInfo {
  name: string;
  available: boolean;
  source: string;
}

export interface GroundTruthReport {
  /** When the analysis was performed */
  timestamp: string;
  /** Root directory analyzed */
  projectRoot: string;

  // Package-level facts
  packageJson: {
    exists: boolean;
    parsed: PackageJson | null;
    raw: string | null;
  };

  // Entry points
  entryPoints: {
    main?: VerifiedEntryPoint;
    bin?: Record<string, VerifiedEntryPoint>;
    cli?: VerifiedEntryPoint;
  };

  // Commands that actually work
  availableCommands: VerifiedCommand[];

  // Installation method
  installation: {
    isPublished: boolean;
    npmPackage: string | null;
    installCommand: string;
    reason: string;
  };

  // Project structure
  structure: {
    srcDir: boolean;
    hasTypeScript: boolean;
    hasTests: boolean;
    testPattern: string | null;
    sourceFiles: number;
    testFiles: number;
  };

  // Tools availability
  tools: ToolInfo[];

  // Git info
  git: {
    isRepo: boolean;
    remoteUrl: string | null;
    defaultBranch: string | null;
  };

  // Validation helpers
  _validation: {
    /** Check if a command exists in package.json scripts */
    hasScript: (name: string) => boolean;
    /** Check if a file exists in project */
    hasFile: (path: string) => boolean;
    /** Check if a bin command exists */
    hasBin: (name: string) => boolean;
  };
}

// ─── CONSTANTS ─────────────────────────────────────────────────

const BIN_PATH = "./bin/foreman";
const CLI_PATH = "./src/cli.ts";
const PACKAGE_PATH = "./package.json";

// ─── ANALYZER ──────────────────────────────────────────────────

export class GroundTruthEngine {
  private projectRoot: string;
  private cache: Map<string, unknown> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  /**
   * Perform complete codebase analysis.
   * This is the main entry point - call this before any LLM generation.
   */
  async analyze(): Promise<GroundTruthReport> {
    const timestamp = new Date().toISOString();

    // 1. Read package.json (critical)
    const packageInfo = this.readPackageJson();

    // 2. Analyze entry points
    const entryPoints = this.analyzeEntryPoints(packageInfo.parsed);

    // 3. Extract available commands
    const commands = this.extractCommands(packageInfo.parsed);

    // 4. Determine installation method
    const installation = this.determineInstallation(packageInfo.parsed);

    // 5. Analyze project structure
    const structure = this.analyzeStructure();

    // 6. Check tools
    const tools = this.analyzeTools();

    // 7. Git info
    const git = this.analyzeGit();

    const report: GroundTruthReport = {
      timestamp,
      projectRoot: this.projectRoot,
      packageJson: packageInfo,
      entryPoints,
      availableCommands: commands,
      installation,
      structure,
      tools,
      git,
      _validation: {
        hasScript: (name: string) => {
          return packageInfo.parsed?.scripts?.[name] !== undefined;
        },
        hasFile: (path: string) => {
          return existsSync(join(this.projectRoot, path));
        },
        hasBin: (name: string) => {
          if (!packageInfo.parsed?.bin) return false;
          if (typeof packageInfo.parsed.bin === "string") {
            return name === packageInfo.parsed.name;
          }
          return packageInfo.parsed.bin[name] !== undefined;
        },
      },
    };

    return report;
  }

  private readPackageJson(): GroundTruthReport["packageJson"] {
    const path = join(this.projectRoot, PACKAGE_PATH);

    if (!existsSync(path)) {
      return { exists: false, parsed: null, raw: null };
    }

    const raw = readFileSync(path, "utf-8");

    try {
      const parsed = JSON.parse(raw) as PackageJson;
      return { exists: true, parsed, raw };
    } catch {
      return { exists: true, parsed: null, raw };
    }
  }

  private analyzeEntryPoints(pkg: PackageJson | null): GroundTruthReport["entryPoints"] {
    const result: GroundTruthReport["entryPoints"] = {};

    // Check main entry
    if (pkg?.main) {
      const mainPath = join(this.projectRoot, pkg.main);
      result.main = {
        path: pkg.main,
        exists: existsSync(mainPath),
        type: this.detectModuleType(pkg.main),
      };
    }

    // Check bin entries
    if (pkg?.bin) {
      result.bin = {};
      if (typeof pkg.bin === "string") {
        // Single bin named after package
        const binPath = join(this.projectRoot, pkg.bin);
        result.bin[pkg.name || "unknown"] = {
          path: pkg.bin,
          exists: existsSync(binPath),
          type: this.detectModuleType(pkg.bin),
        };
      } else {
        // Multiple bins
        for (const [name, path] of Object.entries(pkg.bin)) {
          const fullPath = join(this.projectRoot, path);
          result.bin[name] = {
            path,
            exists: existsSync(fullPath),
            type: this.detectModuleType(path),
          };
        }
      }
    }

    // Check CLI path (common pattern)
    const cliFullPath = join(this.projectRoot, CLI_PATH);
    if (existsSync(cliFullPath)) {
      result.cli = {
        path: CLI_PATH,
        exists: true,
        type: "ts",
      };
    }

    return result;
  }

  private detectModuleType(filename: string): VerifiedEntryPoint["type"] {
    if (filename.endsWith(".mjs") || filename.endsWith(".esm.js")) return "esm";
    if (filename.endsWith(".cjs")) return "cjs";
    if (filename.endsWith(".ts")) return "ts";
    if (filename.endsWith(".js")) {
      // Check package.json type field
      const pkgPath = join(this.projectRoot, PACKAGE_PATH);
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return pkg.type === "module" ? "esm" : "cjs";
      }
      return "cjs";
    }
    return "unknown";
  }

  private extractCommands(pkg: PackageJson | null): VerifiedCommand[] {
    const commands: VerifiedCommand[] = [];

    if (!pkg) return commands;

    // Extract npm scripts
    if (pkg.scripts) {
      for (const [name, script] of Object.entries(pkg.scripts)) {
        commands.push({
          name: `npm run ${name}`,
          script,
          source: "package.json",
          exists: true,
        });
      }
    }

    // Extract bin commands
    if (pkg.bin) {
      if (typeof pkg.bin === "string") {
        const binName = pkg.name || "unknown";
        const binPath = join(this.projectRoot, pkg.bin);
        commands.push({
          name: binName,
          script: pkg.bin,
          source: "bin",
          exists: existsSync(binPath),
        });
      } else {
        for (const [name, path] of Object.entries(pkg.bin)) {
          const binPath = join(this.projectRoot, path);
          commands.push({
            name,
            script: path,
            source: "bin",
            exists: existsSync(binPath),
          });
        }
      }
    }

    return commands;
  }

  private determineInstallation(pkg: PackageJson | null): GroundTruthReport["installation"] {
    if (!pkg) {
      return {
        isPublished: false,
        npmPackage: null,
        installCommand: "# No package.json found",
        reason: "No package.json - cannot determine installation method",
      };
    }

    // Check if it looks like a published package
    // Published packages typically have version >= 1.0.0 or specific fields
    const version = pkg.version || "0.0.0";
    const isPublished = false; // Conservative: assume not published unless verified

    // Determine install command based on structure
    let installCommand: string;
    let reason: string;

    if (pkg.bin && (typeof pkg.bin === "string" || Object.keys(pkg.bin).length > 0)) {
      // Has bin entry - can be installed globally after clone
      installCommand = `git clone <repo-url>\ncd ${pkg.name || "project"}\nnpm install\nnpm link`;
      reason = "Has bin entry - can use npm link for global access after clone";
    } else {
      // No bin - just a library or app
      installCommand = `git clone <repo-url>\ncd ${pkg.name || "project"}\nnpm install`;
      reason = "Standard Node.js project - clone and install";
    }

    return {
      isPublished,
      npmPackage: pkg.name || null,
      installCommand,
      reason,
    };
  }

  private analyzeStructure(): GroundTruthReport["structure"] {
    const srcDir = existsSync(join(this.projectRoot, "src"));
    const hasTypeScript = this.countFiles(".ts") > 0;
    const hasTests = this.countFiles(".test.ts") > 0 || this.countFiles(".spec.ts") > 0;

    let testPattern: string | null = null;
    if (this.countFiles(".test.ts") > 0) testPattern = "*.test.ts";
    else if (this.countFiles(".spec.ts") > 0) testPattern = "*.spec.ts";

    return {
      srcDir,
      hasTypeScript,
      hasTests,
      testPattern,
      sourceFiles: this.countFiles(".ts") + this.countFiles(".js"),
      testFiles: this.countFiles(".test.ts") + this.countFiles(".spec.ts"),
    };
  }

  private countFiles(extension: string): number {
    try {
      const srcPath = join(this.projectRoot, "src");
      if (!existsSync(srcPath)) return 0;

      const files = readdirSync(srcPath, { recursive: true }) as string[];
      return files.filter((f) => f.endsWith(extension)).length;
    } catch {
      return 0;
    }
  }

  private analyzeTools(): ToolInfo[] {
    // Check which tools are available based on actual files
    const tools: ToolInfo[] = [];

    // Check for known tools by looking at imports in tools.ts
    const toolsPath = join(this.projectRoot, "src/tools.ts");
    if (existsSync(toolsPath)) {
      const content = readFileSync(toolsPath, "utf-8");

      const toolPatterns = [
        { name: "bash", pattern: /name:\s*"bash"/ },
        { name: "read_file", pattern: /name:\s*"read_file"/ },
        { name: "write_file", pattern: /name:\s*"write_file"/ },
        { name: "edit_file", pattern: /name:\s*"edit_file"/ },
        { name: "search_files", pattern: /name:\s*"search_files"/ },
        { name: "grep", pattern: /name:\s*"grep"/ },
        { name: "list_dir", pattern: /name:\s*"list_dir"/ },
        { name: "batch_write", pattern: /name:\s*"batch_write"/ },
        { name: "git_status", pattern: /name:\s*"git_status"/ },
        { name: "git_commit", pattern: /name:\s*"git_commit"/ },
        { name: "security_scan", pattern: /name:\s*"security_scan"/ },
        { name: "web_search", pattern: /name:\s*"web_search"/ },
        { name: "web_fetch", pattern: /name:\s*"web_fetch"/ },
      ];

      for (const { name, pattern } of toolPatterns) {
        tools.push({
          name,
          available: pattern.test(content),
          source: "src/tools.ts",
        });
      }
    }

    return tools;
  }

  private analyzeGit(): GroundTruthReport["git"] {
    const gitDir = join(this.projectRoot, ".git");
    const isRepo = existsSync(gitDir);

    let remoteUrl: string | null = null;
    let defaultBranch: string | null = null;

    if (isRepo) {
      // Try to read git config
      const configPath = join(gitDir, "config");
      if (existsSync(configPath)) {
        const config = readFileSync(configPath, "utf-8");
        const remoteMatch = config.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/);
        if (remoteMatch) {
          remoteUrl = remoteMatch[1].trim();
        }
      }

      // Try to read HEAD
      const headPath = join(gitDir, "HEAD");
      if (existsSync(headPath)) {
        const head = readFileSync(headPath, "utf-8");
        const refMatch = head.match(/ref:\s*refs\/heads\/(\w+)/);
        if (refMatch) {
          defaultBranch = refMatch[1];
        }
      }
    }

    return { isRepo, remoteUrl, defaultBranch };
  }

  /**
   * Generate context string for prompts.
   * This is what gets injected into LLM context.
   */
  generateContextString(report: GroundTruthReport): string {
    const lines: string[] = [];

    lines.push("## Project Facts (Ground Truth)");
    lines.push("");

    // Installation
    lines.push("### Installation (Verified)");
    lines.push("```");
    lines.push(report.installation.installCommand);
    lines.push("```");
    lines.push(`Note: ${report.installation.reason}`);
    lines.push("");

    // Available commands
    lines.push("### Available Commands (Verified)");
    if (report.availableCommands.length === 0) {
      lines.push("No commands found in package.json");
    } else {
      for (const cmd of report.availableCommands.slice(0, 10)) {
        const status = cmd.exists ? "✓" : "✗";
        lines.push(`- ${status} \`${cmd.name}\` (${cmd.source})`);
      }
    }
    lines.push("");

    // Entry points
    lines.push("### Entry Points");
    if (report.entryPoints.main) {
      lines.push(`- Main: ${report.entryPoints.main.path} (${report.entryPoints.main.exists ? "exists" : "missing"})`);
    }
    if (report.entryPoints.cli) {
      lines.push(`- CLI: ${report.entryPoints.cli.path} (${report.entryPoints.cli.exists ? "exists" : "missing"})`);
    }
    if (report.entryPoints.bin) {
      for (const [name, info] of Object.entries(report.entryPoints.bin)) {
        lines.push(`- Bin (${name}): ${info.path} (${info.exists ? "exists" : "missing"})`);
      }
    }
    lines.push("");

    // Structure
    lines.push("### Project Structure");
    lines.push(`- Source files: ${report.structure.sourceFiles}`);
    lines.push(`- Test files: ${report.structure.testFiles}`);
    lines.push(`- Has TypeScript: ${report.structure.hasTypeScript}`);
    lines.push(`- Test pattern: ${report.structure.testPattern || "none detected"}`);
    lines.push("");

    // Tools
    lines.push("### Available Tools");
    const availableTools = report.tools.filter((t) => t.available);
    lines.push(availableTools.map((t) => t.name).join(", "));
    lines.push("");

    // Critical constraints
    lines.push("### CRITICAL CONSTRAINTS");
    lines.push("- ONLY use commands listed above - do not invent commands");
    lines.push("- ONLY reference files that exist - verify with read_file first");
    lines.push("- DO NOT claim npm install -g works unless isPublished=true");
    lines.push("- DO NOT invent metrics (time, cost, performance) - only report actual measurements");
    lines.push("");

    return lines.join("\n");
  }
}

// ─── FACTORY ───────────────────────────────────────────────────

export async function analyzeGroundTruth(projectRoot: string): Promise<GroundTruthReport> {
  const engine = new GroundTruthEngine(projectRoot);
  return engine.analyze();
}
