/**
 * FOREMAN — Project Detector Engine
 *
 * Auto-detect project type, framework, language, build system,
 * test framework, and package manager from project files.
 *
 * Capabilities:
 * - Language detection (TypeScript, Python, Rust, Go, Java, C#, etc.)
 * - Framework detection (React, Next.js, Express, Django, FastAPI, etc.)
 * - Build system detection (npm, pnpm, yarn, cargo, go, gradle, etc.)
 * - Test framework detection (vitest, jest, pytest, cargo test, etc.)
 * - Monorepo detection (workspaces, lerna, nx, turborepo)
 * - CI/CD detection (GitHub Actions, GitLab CI, CircleCI)
 * - Docker detection
 * - Database detection (from config files, env vars)
 * - Dependency analysis
 * - Project health score
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface ProjectInfo {
  name: string;
  description?: string;
  version?: string;
  language: ProjectLanguage;
  languages: ProjectLanguage[];
  framework?: string;
  frameworks: string[];
  buildSystem: string;
  packageManager?: string;
  testFramework?: string;
  runtime?: string;
  isMonorepo: boolean;
  monorepoTool?: string;
  hasDocker: boolean;
  hasCI: boolean;
  ciProvider?: string;
  database?: string;
  linter?: string;
  formatter?: string;
  dependencies: { prod: number; dev: number };
  fileCount: number;
  srcDir?: string;
  entryPoint?: string;
  scripts: Record<string, string>;
  healthScore: number;
  healthIssues: string[];
}

export type ProjectLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "csharp"
  | "cpp"
  | "c"
  | "ruby"
  | "php"
  | "swift"
  | "kotlin"
  | "dart"
  | "elixir"
  | "scala"
  | "unknown";

// ─── DETECT ──────────────────────────────────────────────────

/**
 * Detect project information from a directory.
 */
export function detectProject(projectRoot: string): ProjectInfo {
  const info: ProjectInfo = {
    name: projectRoot.split("/").pop() ?? "unknown",
    language: "unknown",
    languages: [],
    frameworks: [],
    buildSystem: "unknown",
    isMonorepo: false,
    hasDocker: false,
    hasCI: false,
    dependencies: { prod: 0, dev: 0 },
    fileCount: 0,
    scripts: {},
    healthScore: 0,
    healthIssues: [],
  };

  // ─── PACKAGE.JSON (Node.js/TypeScript/JavaScript) ──────
  const pkgPath = join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      info.name = pkg.name ?? info.name;
      info.description = pkg.description;
      info.version = pkg.version;
      info.dependencies = {
        prod: Object.keys(pkg.dependencies ?? {}).length,
        dev: Object.keys(pkg.devDependencies ?? {}).length,
      };
      info.scripts = pkg.scripts ?? {};

      // Detect TypeScript
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps.typescript || existsSync(join(projectRoot, "tsconfig.json"))) {
        info.language = "typescript";
        info.languages.push("typescript");
      } else {
        info.language = "javascript";
        info.languages.push("javascript");
      }

      // Detect frameworks
      if (allDeps.react || allDeps["react-dom"]) info.frameworks.push("react");
      if (allDeps.next) info.frameworks.push("next.js");
      if (allDeps.vue) info.frameworks.push("vue");
      if (allDeps.nuxt) info.frameworks.push("nuxt");
      if (allDeps.svelte) info.frameworks.push("svelte");
      if (allDeps["@sveltejs/kit"]) info.frameworks.push("sveltekit");
      if (allDeps.express) info.frameworks.push("express");
      if (allDeps.fastify) info.frameworks.push("fastify");
      if (allDeps.hono) info.frameworks.push("hono");
      if (allDeps["@nestjs/core"]) info.frameworks.push("nestjs");
      if (allDeps.astro) info.frameworks.push("astro");
      if (allDeps.remix || allDeps["@remix-run/node"]) info.frameworks.push("remix");
      if (allDeps.electron) info.frameworks.push("electron");
      if (allDeps["react-native"]) info.frameworks.push("react-native");
      if (allDeps.expo) info.frameworks.push("expo");
      if (allDeps.tailwindcss) info.frameworks.push("tailwind");

      // Detect test framework
      if (allDeps.vitest) info.testFramework = "vitest";
      else if (allDeps.jest) info.testFramework = "jest";
      else if (allDeps.mocha) info.testFramework = "mocha";
      else if (allDeps.ava) info.testFramework = "ava";
      else if (pkg.scripts?.test?.includes("node --test")) info.testFramework = "node:test";

      // Detect linter/formatter
      if (allDeps.eslint || allDeps["@eslint/js"]) info.linter = "eslint";
      else if (allDeps.oxlint || allDeps["oxlint"]) info.linter = "oxlint";
      else if (allDeps.biome || allDeps["@biomejs/biome"]) info.linter = "biome";
      if (allDeps.prettier) info.formatter = "prettier";
      else if (allDeps.biome || allDeps["@biomejs/biome"]) info.formatter = "biome";

      // Detect package manager
      if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) info.packageManager = "pnpm";
      else if (existsSync(join(projectRoot, "yarn.lock"))) info.packageManager = "yarn";
      else if (existsSync(join(projectRoot, "bun.lockb")) || existsSync(join(projectRoot, "bun.lock"))) info.packageManager = "bun";
      else if (existsSync(join(projectRoot, "package-lock.json"))) info.packageManager = "npm";

      // Detect monorepo
      if (pkg.workspaces) {
        info.isMonorepo = true;
        info.monorepoTool = "workspaces";
      }
      if (allDeps.lerna) info.monorepoTool = "lerna";
      if (allDeps.nx || allDeps["@nx/workspace"]) info.monorepoTool = "nx";
      if (existsSync(join(projectRoot, "turbo.json"))) info.monorepoTool = "turborepo";

      info.framework = info.frameworks[0];
      info.buildSystem = info.packageManager ?? "npm";

      // Detect database
      if (allDeps.prisma || allDeps["@prisma/client"]) info.database = "prisma";
      else if (allDeps.drizzle || allDeps["drizzle-orm"]) info.database = "drizzle";
      else if (allDeps.mongoose) info.database = "mongodb";
      else if (allDeps.pg || allDeps.postgres) info.database = "postgresql";
      else if (allDeps.mysql2) info.database = "mysql";
      else if (allDeps["better-sqlite3"]) info.database = "sqlite";

      // Runtime
      if (allDeps.bun || info.packageManager === "bun") info.runtime = "bun";
      else if (allDeps.deno || existsSync(join(projectRoot, "deno.json"))) info.runtime = "deno";
      else info.runtime = "node";
    } catch { /* invalid package.json */ }
  }

  // ─── PYTHON ────────────────────────────────────────────
  if (existsSync(join(projectRoot, "pyproject.toml")) ||
      existsSync(join(projectRoot, "setup.py")) ||
      existsSync(join(projectRoot, "requirements.txt"))) {
    if (!info.languages.includes("python" as ProjectLanguage)) {
      info.languages.push("python");
    }
    if (info.language === "unknown") info.language = "python";

    if (existsSync(join(projectRoot, "pyproject.toml"))) {
      try {
        const toml = readFileSync(join(projectRoot, "pyproject.toml"), "utf-8");
        if (toml.includes("django")) info.frameworks.push("django");
        if (toml.includes("fastapi")) info.frameworks.push("fastapi");
        if (toml.includes("flask")) info.frameworks.push("flask");
        if (toml.includes("pytest")) info.testFramework = "pytest";
        if (toml.includes("poetry")) info.buildSystem = "poetry";
        else if (toml.includes("pdm")) info.buildSystem = "pdm";
        else if (toml.includes("hatch")) info.buildSystem = "hatch";
        else info.buildSystem = "pip";

        // Extract name
        const nameMatch = toml.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) info.name = nameMatch[1];
      } catch { /* ignore */ }
    }

    if (existsSync(join(projectRoot, "requirements.txt"))) {
      try {
        const reqs = readFileSync(join(projectRoot, "requirements.txt"), "utf-8");
        info.dependencies.prod = reqs.split("\n").filter(l => l.trim() && !l.startsWith("#")).length;
        if (reqs.includes("django")) info.frameworks.push("django");
        if (reqs.includes("fastapi")) info.frameworks.push("fastapi");
        if (reqs.includes("flask")) info.frameworks.push("flask");
      } catch { /* ignore */ }
    }

    info.framework = info.framework ?? info.frameworks[0];
  }

  // ─── RUST ──────────────────────────────────────────────
  if (existsSync(join(projectRoot, "Cargo.toml"))) {
    info.language = "rust";
    info.languages.push("rust");
    info.buildSystem = "cargo";
    info.testFramework = "cargo test";
    info.packageManager = "cargo";

    try {
      const cargo = readFileSync(join(projectRoot, "Cargo.toml"), "utf-8");
      const nameMatch = cargo.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) info.name = nameMatch[1];
      if (cargo.includes("actix")) info.frameworks.push("actix");
      if (cargo.includes("axum")) info.frameworks.push("axum");
      if (cargo.includes("rocket")) info.frameworks.push("rocket");
      if (cargo.includes("[workspace]")) info.isMonorepo = true;
    } catch { /* ignore */ }
  }

  // ─── GO ────────────────────────────────────────────────
  if (existsSync(join(projectRoot, "go.mod"))) {
    info.language = "go";
    info.languages.push("go");
    info.buildSystem = "go";
    info.testFramework = "go test";
    info.packageManager = "go";

    try {
      const gomod = readFileSync(join(projectRoot, "go.mod"), "utf-8");
      const modMatch = gomod.match(/module\s+(\S+)/);
      if (modMatch) info.name = modMatch[1].split("/").pop() ?? info.name;
      if (gomod.includes("gin-gonic")) info.frameworks.push("gin");
      if (gomod.includes("echo")) info.frameworks.push("echo");
      if (gomod.includes("fiber")) info.frameworks.push("fiber");
    } catch { /* ignore */ }
  }

  // ─── JAVA/KOTLIN ───────────────────────────────────────
  if (existsSync(join(projectRoot, "pom.xml"))) {
    info.language = "java";
    info.languages.push("java");
    info.buildSystem = "maven";
  } else if (existsSync(join(projectRoot, "build.gradle")) || existsSync(join(projectRoot, "build.gradle.kts"))) {
    info.buildSystem = "gradle";
    if (existsSync(join(projectRoot, "build.gradle.kts"))) {
      info.language = "kotlin";
      info.languages.push("kotlin");
    } else {
      info.language = "java";
      info.languages.push("java");
    }
  }

  // ─── DOCKER ────────────────────────────────────────────
  info.hasDocker = existsSync(join(projectRoot, "Dockerfile")) ||
    existsSync(join(projectRoot, "docker-compose.yml")) ||
    existsSync(join(projectRoot, "docker-compose.yaml")) ||
    existsSync(join(projectRoot, "compose.yml"));

  // ─── CI/CD ─────────────────────────────────────────────
  if (existsSync(join(projectRoot, ".github", "workflows"))) {
    info.hasCI = true;
    info.ciProvider = "github-actions";
  } else if (existsSync(join(projectRoot, ".gitlab-ci.yml"))) {
    info.hasCI = true;
    info.ciProvider = "gitlab-ci";
  } else if (existsSync(join(projectRoot, ".circleci"))) {
    info.hasCI = true;
    info.ciProvider = "circleci";
  }

  // ─── SOURCE DIRECTORY ──────────────────────────────────
  const srcCandidates = ["src", "lib", "app", "source", "pkg"];
  for (const dir of srcCandidates) {
    if (existsSync(join(projectRoot, dir)) && statSync(join(projectRoot, dir)).isDirectory()) {
      info.srcDir = dir;
      break;
    }
  }

  // ─── ENTRY POINT ──────────────────────────────────────
  const entryPoints = [
    "src/index.ts", "src/main.ts", "src/app.ts",
    "src/index.js", "src/main.js", "src/app.js",
    "index.ts", "index.js", "main.ts", "main.py",
    "app.py", "manage.py", "src/main.rs", "main.go", "cmd/main.go",
  ];
  for (const ep of entryPoints) {
    if (existsSync(join(projectRoot, ep))) {
      info.entryPoint = ep;
      break;
    }
  }

  // ─── FILE COUNT ────────────────────────────────────────
  info.fileCount = countSourceFiles(projectRoot);

  // ─── HEALTH SCORE ──────────────────────────────────────
  info.healthScore = calculateHealthScore(info, projectRoot);

  // Deduplicate
  info.frameworks = [...new Set(info.frameworks)];
  info.languages = [...new Set(info.languages)];
  info.framework = info.framework ?? info.frameworks[0];

  return info;
}

/**
 * Generate a human-readable project summary for LLM context.
 */
export function formatProjectContext(info: ProjectInfo): string {
  const lines: string[] = [];
  lines.push(`Project: ${info.name}${info.version ? ` v${info.version}` : ""}`);
  if (info.description) lines.push(`Description: ${info.description}`);
  lines.push(`Language: ${info.language}${info.languages.length > 1 ? ` (+ ${info.languages.filter(l => l !== info.language).join(", ")})` : ""}`);
  if (info.framework) lines.push(`Framework: ${info.frameworks.join(", ")}`);
  lines.push(`Build: ${info.buildSystem}${info.packageManager ? ` (${info.packageManager})` : ""}`);
  if (info.testFramework) lines.push(`Tests: ${info.testFramework}`);
  if (info.runtime) lines.push(`Runtime: ${info.runtime}`);
  if (info.linter) lines.push(`Linter: ${info.linter}`);
  if (info.database) lines.push(`Database: ${info.database}`);
  if (info.isMonorepo) lines.push(`Monorepo: ${info.monorepoTool ?? "yes"}`);
  if (info.hasDocker) lines.push(`Docker: yes`);
  if (info.hasCI) lines.push(`CI: ${info.ciProvider}`);
  lines.push(`Files: ${info.fileCount}${info.srcDir ? ` (src: ${info.srcDir}/)` : ""}`);
  lines.push(`Deps: ${info.dependencies.prod} prod, ${info.dependencies.dev} dev`);
  lines.push(`Health: ${info.healthScore}/100`);

  if (info.healthIssues.length > 0) {
    lines.push(`Issues: ${info.healthIssues.join("; ")}`);
  }

  return lines.join("\n");
}

// ─── HELPERS ─────────────────────────────────────────────────

function countSourceFiles(dir: string, depth = 0): number {
  if (depth > 4) return 0;
  let count = 0;
  const ignore = new Set(["node_modules", ".git", "dist", "build", "__pycache__", ".next", "target", "vendor"]);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || ignore.has(entry.name)) continue;

      if (entry.isDirectory()) {
        count += countSourceFiles(join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if ([".ts", ".js", ".tsx", ".jsx", ".py", ".rs", ".go", ".java", ".kt", ".cs", ".rb", ".php", ".swift", ".dart"].includes(ext)) {
          count++;
        }
      }
    }
  } catch { /* permission denied etc */ }

  return count;
}

function calculateHealthScore(info: ProjectInfo, projectRoot: string): number {
  let score = 50; // Base score

  // Has tests (+15)
  if (info.testFramework) {
    score += 15;
  } else {
    info.healthIssues.push("No test framework detected");
  }

  // Has linter (+10)
  if (info.linter) score += 10;
  else info.healthIssues.push("No linter detected");

  // Has CI (+10)
  if (info.hasCI) score += 10;
  else info.healthIssues.push("No CI/CD detected");

  // Has README (+5)
  if (existsSync(join(projectRoot, "README.md"))) score += 5;
  else info.healthIssues.push("No README.md");

  // Has .gitignore (+5)
  if (existsSync(join(projectRoot, ".gitignore"))) score += 5;

  // Has Docker (+5)
  if (info.hasDocker) score += 5;

  // Has too many deps (-5)
  if (info.dependencies.prod > 50) {
    score -= 5;
    info.healthIssues.push(`High dependency count (${info.dependencies.prod})`);
  }

  // No entry point found (-10)
  if (!info.entryPoint) {
    score -= 10;
    info.healthIssues.push("No entry point detected");
  }

  return Math.max(0, Math.min(100, score));
}
