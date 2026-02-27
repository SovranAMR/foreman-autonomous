/**
 * FOREMAN — CLI
 *
 * User Commands:
 *   foreman setup           — configure API keys (interactive)
 *   foreman init <name>     — create a new project
 *   foreman status          — show current status (memory/session/cache included)
 *   foreman run <task>      — run a task (full pipeline — session/memory/cache automatic)
 *   foreman task add        — add a new task
 *   foreman task list       — list tasks
 *   foreman task show <id>  — task details
 *   foreman task done <id>  — mark task as done
 *   foreman board           — kanban board view
 *   foreman doctor          — system health check
 *   foreman serve           — start messaging gateway (Telegram/WhatsApp)
 *
 * Developer Commands (debug/inspect — hidden from end users):
 *   foreman internals thoughts    — list thoughts
 *   foreman internals chains      — list chains
 *   foreman internals history     — state transition history
 *   foreman internals memory      — list memories
 *   foreman internals sessions    — list sessions
 *   foreman internals cache       — cache statistics
 *   foreman internals providers   — provider status
 */

// Global error handlers — prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error(`[foreman] Uncaught exception:`, err.message);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[foreman] Unhandled rejection:`, reason instanceof Error ? reason.message : String(reason));
});

import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { StateManager } from "./state.js";
import { ThoughtManager } from "./thought-manager.js";
import { ChainManager } from "./chain-manager.js";
import { Engine } from "./engine.js";
import { MockProvider } from "./provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { loginAntigravity } from "./antigravity-oauth.js";
import { AntigravityProvider, loadCredentials, saveCredentials, getChatModels } from "./antigravity-provider.js";
import { getCachedModels } from "./model-discovery.js";
import { DEFAULT_LAYER_MODELS } from "./model-fallback.js";
import { hasAnyProvider, runOnboarding } from "./onboarding.js";
import { Orchestrator } from "./orchestrator.js";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import {
  brand, icon, grad, printLogo, printForgeIntro, printForgeBanner,
  phaseHeader, thoughtLine, blockLine,
  reflectionLine, completionBox, statusBox,
  forgeDivider, thoughtSpark, forgeProgress,
  doctorHeader, doctorItem, doctorFooter,
  printIdleForge, FORGE_SPINNER,
} from "./theme.js";
import {
  animateDwarf, animateSparkRain, animateFire,
  animatePhaseTransition, animateCompletion,
  animateProgressStrike, startForgeSpinner, typeText,
} from "./animations.js";
import { startRepl } from "./repl.js";
import { runSetup, getApiKey, printProviderStatus } from "./setup.js";
import { TaskManager } from "./task-manager.js";
import { ProjectManager } from "./project-manager.js";
import { MemoryManager } from "./memory-manager.js";
import { SessionManager } from "./session-manager.js";
import { CacheManager } from "./cache-manager.js";
import type { TaskPriority, TaskType } from "./types.js";
import { scanProject } from "./security-scanner.js";
import { checkChainHealth } from "./chain-repair.js";
import { repairTranscript } from "./transcript-repair.js";
import { GitEngine } from "./git-engine.js";
import { ExecutionEngine } from "./execution-engine.js";
import { safeJsonParseOr } from "./errors.js";

const program = new Command();

program
  .name("foreman")
  .description(grad.logo("AI Agent Orchestrator — Atomic Thought Chains"))
  .version("0.1.0");

// ─── DEFAULT COMMAND (REPL or Telegram Gateway) ─────────────────────────

program.action(async () => {
  // Load config module to check for Telegram settings
  const { getTelegramToken, isTelegramEnabled } = await import("./config.js");

  // Check if Telegram token is configured via environment or config file
  const tgToken = getTelegramToken();
  const tgEnabled = isTelegramEnabled();

  // ─── TELEGRAM AUTO-ACTIVATION (Production Mode) ──────────────────────
  // When FOREMAN_TELEGRAM_TOKEN is set, automatically start Telegram gateway
  // No onboarding prompts - assumes already configured

  if (tgToken && tgEnabled) {
    // Validate Telegram token format: must be "digits:alphanumeric"
    const isValidTokenFormat = /^\d+:[A-Za-z0-9_-]{30,}$/.test(tgToken);
    if (!isValidTokenFormat) {
      console.log(brand.red(`  ⚠ Invalid Telegram token format — skipping gateway`));
      console.log(`    ${brand.dim("Token must be in format: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ")}`);
      console.log(`    ${brand.dim("Falling back to interactive REPL...\n")}`);
      const { startRepl } = await import("./repl.js");
      return startRepl();
    }

    // Telegram token found and enabled — try to start the messaging gateway
    console.log(brand.gold("  ◆ Foreman Telegram Gateway\n"));
    console.log(`    ${brand.dim("✓ Token detected from environment or config")}`);
    console.log(`    ${brand.dim("✓ Auto-starting gateway...")}\n`);

    let gatewayStarted = false;
    try {
      const { MessagingGateway } = await import("./messaging-gateway.js");
      const projectRoot = process.cwd();

      const gateway = new MessagingGateway({
        projectRoot,
        projectName: "foreman",
        channels: [{
          type: "telegram",
          enabled: true,
          botToken: tgToken,
          allowedSenders: [],
        }],
        maxConcurrent: 5,
        messageTimeoutMs: 120_000,
      });

      // Graceful shutdown
      const shutdown = async () => {
        console.log("\n  Shutting down...");
        await gateway.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await gateway.start();

      // Verify at least one channel actually connected
      const channelCount = gateway.getActiveChannels();
      if (channelCount === 0 || !gateway.isRunning()) {
        throw new Error("No channels connected after gateway start");
      }

      gatewayStarted = true;

      // Show live status
      console.log(brand.gold(`\n  🔥 Gateway running — ${channelCount} channel(s) active`));
      console.log(`  ${brand.dim(`Conversations: ${gateway.getConversationCount()} | Running: ${gateway.isRunning()}`)}`);
      console.log(`  ${brand.dim("Press Ctrl+C to stop.\n")}`);

      // Check channel health periodically
      const healthInterval = setInterval(() => {
        if (!gateway.isRunning()) {
          clearInterval(healthInterval);
          return;
        }
        for (const type of ["telegram"] as const) {
          const ch = gateway.getChannel(type);
          if (ch && !ch.isConnected()) {
            console.log(`  ${brand.red("⚠")} ${type} channel disconnected!`);
          }
        }
      }, 60_000);
      healthInterval.unref();

      // Keep the process alive
      await new Promise(() => { });
    } catch (err: any) {
      console.log(`    ${icon.fail} ${brand.red("Telegram gateway failed:")} ${brand.dim(err.message ?? String(err))}`);
      console.log(`    ${brand.dim("Falling back to interactive REPL...")}\n`);
      gatewayStarted = false;
    }

    // If gateway failed, fall through to REPL
    if (!gatewayStarted) {
      printLogo();
      forgeDivider();
      console.log("");
      await startRepl();
      return;
    }
  } else {
    // No Telegram token — run the interactive REPL
    // ── Spark rain entrance ──
    if (process.stdout.isTTY) {
      await animateSparkRain(60, 40);
    }

    // ── Logo ──
    printLogo();

    // ── Dwarf strikes the anvil ──
    if (process.stdout.isTTY) {
      await animateDwarf(3000, 150);
    }
    console.log("");

    // ── Forge divider ──
    forgeDivider();
    console.log("");

    // ── Check credentials & start REPL ──
    const creds = loadCredentials();

    if (!creds || Date.now() >= creds.expiresAt) {
      // No credentials — still show commands for reference, then onboard via REPL
      console.log(brand.gold("  ◆ Quick Start\n"));
      console.log(`    ${brand.dim("$")} ${brand.cyan("foreman login")}              ${brand.dim("# one-time auth")}`);
      console.log(`    ${brand.dim("$")} ${brand.cyan("foreman init my-project")}    ${brand.dim("# scaffold a project")}`);
      console.log(`    ${brand.dim("$")} ${brand.cyan('foreman run "build an API"')} ${brand.dim("# fire up the forge")}`);
      console.log("");
    }

    // Start interactive REPL
    await startRepl();
  }
});

// ─── SETUP ────────────────────────────────────────────────────

program
  .command("setup")
  .description("Configure API keys (Anthropic / OpenAI / Google)")
  .action(async () => {
    await runSetup();
  });

// ─── LOGIN (Antigravity OAuth) ────────────────────────────────

program
  .command("login")
  .description("Authenticate with Google Antigravity OAuth")
  .action(async () => {
    printLogo();

    const existingCreds = loadCredentials();
    if (existingCreds && Date.now() < existingCreds.expiresAt) {
      console.log(`    ${icon.done} ${brand.green("Already authenticated!")}`);
      console.log(`    ${brand.dim("Email:")} ${existingCreds.email ?? "?"}`);
      console.log(`    ${brand.dim("Project:")} ${existingCreds.projectId}`);
      console.log(`    ${brand.dim("Expires:")} ${new Date(existingCreds.expiresAt).toLocaleString()}`);
      console.log("");
      console.log(`    ${brand.dim("To re-authenticate:")} ${brand.cyan("foreman login --force")}`);
      console.log("");

      const args = process.argv;
      if (!args.includes("--force")) return;
    }

    try {
      const creds = await loginAntigravity();
      saveCredentials(creds);
      console.log(`    ${icon.done} ${brand.green("Credentials saved!")}`);
      console.log(`    ${brand.dim("You can now use")} ${brand.cyan("foreman run")} ${brand.dim("with Antigravity models.")}`);
      console.log("");
    } catch (err: any) {
      console.log(`    ${icon.fail} ${brand.red(err.message)}`);
      process.exit(1);
    }
  });

// ─── DOCTOR ───────────────────────────────────────────────────

program
  .command("doctor")
  .description("System health check")
  .action(() => {
    printLogo();
    // Show forge spinner first frame as visual indicator
    if (process.stdout.isTTY && FORGE_SPINNER.frames.length > 0) {
      process.stdout.write(`  ${FORGE_SPINNER.frames[0]}\r`);
    }
    doctorHeader();

    let allOk = true;

    // Node.js
    const nodeVer = process.version;
    const nodeMajor = parseInt(nodeVer.slice(1).split(".")[0]);
    const nodeOk = nodeMajor >= 20;
    if (!nodeOk) allOk = false;
    doctorItem(nodeOk, `Node.js ${nodeVer}`, nodeOk ? undefined : "20+ required");

    // npm
    try {
      const npmVer = execSync("npm -v", { encoding: "utf-8" }).trim();
      doctorItem(true, `npm ${npmVer}`);
    } catch {
      doctorItem(false, "npm not found");
      allOk = false;
    }

    // Providers
    console.log("");
    printProviderStatus();

    // Antigravity OAuth
    const antigravCreds = loadCredentials();
    if (antigravCreds) {
      const expired = Date.now() >= antigravCreds.expiresAt;
      doctorItem(!expired, `Antigravity OAuth`, expired
        ? `expired — foreman login`
        : `${antigravCreds.email ?? "?"} (expires ${new Date(antigravCreds.expiresAt).toLocaleTimeString()})`);
    } else {
      doctorItem(false, `Antigravity OAuth`, "run foreman login to authenticate");
    }

    // Available models
    const chatModels = getChatModels();
    doctorItem(chatModels.length > 0, `Chat models`, `${chatModels.length} available`);

    const cachedModels = getCachedModels();
    if (cachedModels) {
      doctorItem(true, `Discovered models`, `${cachedModels.length} cached`);
    }

    // Layer model defaults
    const layerModels = Object.entries(DEFAULT_LAYER_MODELS);
    if (layerModels.length > 0) {
      console.log("");
      console.log(`  ${brand.dim("Layer models:")}`);
      for (const [layer, candidates] of layerModels) {
        console.log(`    ${brand.bold(layer)}: ${candidates.map(c => c.model).join(" → ")}`);
      }
    }

    // Config
    console.log("");
    const configDir = join(homedir(), ".foreman");
    const configExists = existsSync(configDir);
    doctorItem(configExists, `Config directory`, configDir);
    if (!configExists) allOk = false;

    doctorFooter(allOk);
  });

// ─── INIT ─────────────────────────────────────────────────────

program
  .command("init <name>")
  .description("Initialize a new Foreman project")
  .option("-d, --dir <path>", "Project directory (default: current directory)")
  .action(async (name: string, opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());

    printLogo();

    if (existsSync(join(projectRoot, "state.json"))) {
      console.log(`  ${icon.warn} A Foreman project already exists in this directory.`);
      console.log(brand.dim(`     ${projectRoot}/state.json`));
      return;
    }

    for (const dir of ["thoughts", "chains", "projects"]) {
      mkdirSync(join(projectRoot, dir), { recursive: true });
    }

    const sm = StateManager.create(projectRoot, name);
    sm.save();

    // Create project entry in ProjectManager
    const pm = new ProjectManager(projectRoot);
    pm.create({ name, description: name });

    if (process.stdout.isTTY) await animateFire(1000, 150);

    console.log(`  ${icon.done} ${brand.gold("Project created:")} ${brand.bold(name)}`);
    console.log("");
    console.log(`     📁 ${brand.dim(projectRoot)}`);
    console.log(`     📄 state.json`);
    console.log(`     📁 thoughts/`);
    console.log(`     📁 chains/`);
    console.log("");

    if (process.stdout.isTTY) {
      await typeText(`  The forge awaits: foreman run "${name}"`, 25, brand.cyan);
    } else {
      console.log(`  Next: ${brand.cyan(`foreman run "your task for ${name}"`)}`);
    }
    console.log("");
  });

// ─── STATUS ───────────────────────────────────────────────────

program
  .command("status")
  .description("Show current project status")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = StateManager.load(projectRoot, false);

    if (!sm) {
      printLogo();
      printIdleForge();
      console.log(`    ${icon.fail} No Foreman project found.`);
      console.log(`    ${brand.dim("First:")} ${brand.cyan("foreman init <name>")}`);
      return;
    }

    const snap = sm.snapshot();
    const thoughts = new ThoughtManager(projectRoot);
    const chains = new ChainManager(projectRoot);
    const allThoughts = thoughts.list();

    statusBox({
      name: snap.projectName,
      state: snap.currentState,
      chains: chains.list().length,
      thoughts: allThoughts.length,
      done: allThoughts.filter(t => t.status === "done").length,
      pending: allThoughts.filter(t => t.status === "pending").length,
      blocked: allThoughts.filter(t => t.status === "blocked").length,
      tokens: snap.totalTokens,
      session: snap.sessionStartedAt,
      activeChain: snap.activeChainId,
      activeThought: snap.activeThoughtId,
    });

    // Memory summary
    const mm = new MemoryManager(projectRoot);
    const memStats = mm.stats();
    if (memStats.total > 0) {
      console.log(brand.gold("  ◆ Memory"));
      console.log(`     🔥 ${memStats.hotCount} hot  📌 ${memStats.warmCount} warm  📝 ${memStats.coldCount} cold  (${memStats.total} total)`);
    }

    // Session summary
    const sesm = new SessionManager(projectRoot);
    const activeSession = sesm.getActive();
    const allSessions = sesm.list();
    if (allSessions.length > 0) {
      console.log(brand.gold("  ◆ Sessions"));
      if (activeSession) {
        console.log(`     ${brand.green("●")} Active: ${brand.bold(activeSession.id)} (${activeSession.thoughtIds.length} thoughts, ${activeSession.totalTokens} tokens)`);
      }
      console.log(`     ${allSessions.length} total session`);
    }

    // Cache summary
    const cm = new CacheManager(projectRoot);
    const cacheStats = cm.stats();
    if (cacheStats.entries > 0 || cacheStats.totalHits > 0) {
      console.log(brand.gold("  ◆ Cache"));
      console.log(`     ${cacheStats.entries} entries, ${cacheStats.totalHits} hits, ${brand.green(String(cacheStats.totalTokensSaved))} tokens saved`);
    }

    // Task summary
    const tm = new TaskManager(projectRoot);
    const taskStats = tm.stats();
    if (taskStats.total > 0) {
      console.log(brand.gold("  ◆ Tasks"));
      console.log(`     ${taskStats.done} done, ${taskStats.inProgress} in-progress, ${taskStats.pending} pending, ${taskStats.blocked} blocked (${taskStats.total} total)`);
    }

    // Project summary
    const pm = new ProjectManager(projectRoot);
    const projects = pm.list();
    if (projects.length > 0) {
      console.log(brand.gold("  ◆ Projects"));
      const active = projects.find(p => p.status === "active");
      console.log(`     ${projects.length} project${projects.length > 1 ? "s" : ""}${active ? ` — active: ${brand.bold(active.name)}` : ""}`);
    }

    console.log("");
  });

// ─── RUN ──────────────────────────────────────────────────────

program
  .command("run <task>")
  .description("Run a task through the full pipeline")
  .option("-m, --mock", "Use mock provider (test)")
  .option("-d, --dir <path>", "Project directory")
  .action(async (task: string, opts: { mock?: boolean; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());

    printForgeIntro();

    // Dwarf hammer animation — forge opening
    await animateDwarf(2000, 250);
    await animateSparkRain(40, 600, 100);
    console.log("");

    const engine = new Engine({
      projectRoot,
      projectName: "foreman",
    });

    // Register providers
    if (opts.mock) {
      const mock = new MockProvider("I need more context. Please clarify the task.");
      engine.providers.register({
        name: "mock",
        supportedModels: ["mock-model", "kimi-k2.5", "gemini-3.1-pro-high", "claude-opus", "claude-sonnet", "gpt-4o", "gpt-4o-mini", "gemini-flash", "gemini-pro"],
        generate: mock.generate.bind(mock),
      });
      console.log(`  ${icon.warn} ${brand.gold("Mock provider active")}\n`);
    } else {
      // No provider → automatic onboarding (first run)
      if (!hasAnyProvider()) {
        console.log(`    ${icon.warn} ${brand.gold("No LLM provider configured.")}`);
        const success = await runOnboarding();
        if (!success) {
          console.log("");
          console.log(`    ${icon.fail} ${brand.red("Setup could not be completed.")}`);
          console.log(`    ${brand.cyan("foreman login")} — Google Antigravity OAuth (recommended)`);
          console.log(`    ${brand.cyan("foreman setup")} — configure with API key`);
          console.log(`    ${brand.dim("--mock")} — test mode`);
          process.exit(1);
        }
      }

      // Get key from config or env var
      const anthropicKey = getApiKey("anthropic");
      const openaiKey = getApiKey("openai");

      if (anthropicKey) {
        try {
          const anthropic = new AnthropicProvider(anthropicKey);
          engine.providers.register(anthropic);
          console.log(`  ${icon.done} Anthropic ${brand.dim("(Claude)")}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} Anthropic: ${brand.dim(e.message)}`);
        }
      }

      if (openaiKey) {
        try {
          const openai = new OpenAIProvider(openaiKey);
          engine.providers.register(openai);
          console.log(`  ${icon.done} OpenAI ${brand.dim("(GPT)")}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} OpenAI: ${brand.dim(e.message)}`);
        }
      }

      const googleKey = getApiKey("google");
      if (googleKey) {
        try {
          const gemini = new GeminiProvider(googleKey);
          engine.providers.register(gemini);
          console.log(`  ${icon.done} Google ${brand.dim("(Gemini API Key)")}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} Google: ${brand.dim(e.message)}`);
        }
      }

      // Antigravity OAuth credentials
      const antigravCreds = loadCredentials();
      if (antigravCreds) {
        try {
          const antigrav = new AntigravityProvider(antigravCreds);
          engine.providers.register(antigrav);
          console.log(`  ${icon.done} Antigravity ${brand.dim(`(${antigravCreds.email ?? "OAuth"})`)}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} Antigravity: ${brand.dim(e.message)}`);
        }
      }

      if (engine.providers.size === 0) {
        console.log("");
        console.log(`  ${icon.fail} ${brand.red("No LLM provider found.")}`);
        console.log(`     ${brand.cyan("foreman login")} — Google Antigravity OAuth (free, recommended)`);
        console.log(`     ${brand.cyan("foreman setup")} — configure with API key (Anthropic/OpenAI/Google)`);
        console.log(`     or use the ${brand.dim("--mock")} flag for testing.`);
        process.exit(1);
      }
      console.log("");
    }

    printForgeBanner(task);

    // Orchestrator
    const orchestrator = new Orchestrator(engine);

    let lastPhase = "";

    orchestrator.on(event => {
      switch (event.type) {
        case "phase_start":
          // TTY → animated transition, otherwise static
          if (process.stdout.isTTY) {
            animatePhaseTransition(lastPhase || null, event.phase);
          }
          phaseHeader(event.phase, event.detail);
          lastPhase = event.phase;
          break;
        case "thought_complete":
          thoughtLine(
            event.thought.id,
            event.thought.layer,
            event.thought.confidence,
            event.thought.tokenCost,
          );
          thoughtSpark(event.thought.id, event.thought.confidence);
          break;
        case "block_detected":
          blockLine(event.reason);
          break;
        case "reflection":
          reflectionLine(event.atomCount, event.summary);
          break;
        case "pipeline_complete":
          if (process.stdout.isTTY) {
            animateCompletion(true);
          }
          completionBox(event.totalThoughts, event.totalTokens, true);
          break;
        case "error":
          console.log(`  ${icon.fail} ${brand.red(event.message)}`);
          break;
      }
    });

    try {
      const result = await orchestrator.run(task);
      if (!result.success) {
        if (process.stdout.isTTY) {
          await animateCompletion(false);
        }
        completionBox(result.totalThoughts, result.totalTokens, false);
        console.log(`  Check status with ${brand.dim("foreman status")}.`);
      }

      // Git branch cleanup — switch back to main, restore stash
      try {
        const branchCleanup = engine.completeTaskBranch({ deleteBranch: result.success });
        if (branchCleanup.success) {
          const stashRestore = engine.restoreStash();
          if (stashRestore.success) {
            // Silent success
          }
        }
      } catch {
        // Git cleanup is best-effort
      }
    } catch (err: any) {
      console.log("");
      console.log(`  ${icon.fail} ${brand.red(err.message)}`);
      process.exit(1);
    }
    console.log("");
  });

// ─── TASKS ────────────────────────────────────────────────────

const taskCmd = program
  .command("task")
  .description("Task management");

taskCmd
  .command("add <title>")
  .description("Add a new task")
  .option("-d, --dir <path>", "Project directory")
  .option("-p, --priority <p>", "Priority (critical/high/medium/low)", "medium")
  .option("-t, --type <t>", "Type (feature/bug/research/design/refactor/test/docs/idea)", "feature")
  .option("--depends <ids>", "Dependencies (comma-separated)")
  .option("--tags <tags>", "Tags (comma-separated)")
  .option("--effort <n>", "Effort (1-8)")
  .option("--desc <text>", "Description")
  .option("--parent <id>", "Parent task ID")
  .action((title: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    const pm = new ProjectManager(projectRoot);

    // Find first project
    const projects = pm.list();
    const projectId = projects[0]?.id ?? "proj_001";

    const task = tm.create({
      projectId,
      title,
      description: opts.desc ?? title,
      type: (opts.type ?? "feature") as TaskType,
      priority: (opts.priority ?? "medium") as TaskPriority,
      dependsOn: opts.depends?.split(",").map((s: string) => s.trim()) ?? [],
      tags: opts.tags?.split(",").map((s: string) => s.trim()) ?? [],
      effort: opts.effort ? parseInt(opts.effort) : undefined,
      parentTaskId: opts.parent,
    });

    // Link to project
    if (projects[0]) {
      pm.addTask(projectId, task.id);
    }

    console.log(`  ${icon.done} ${brand.bold(task.id)} ${brand.gold(title)}`);
    console.log(`     ${brand.dim(`priority: ${task.priority} | type: ${task.type} | effort: ${task.effort ?? "—"}`)}`);
    if (task.dependsOn.length > 0) {
      console.log(`     ${brand.dim(`depends: ${task.dependsOn.join(", ")}`)}`);
    }
    console.log("");
  });

taskCmd
  .command("list")
  .alias("ls")
  .description("List tasks")
  .option("-d, --dir <path>", "Project directory")
  .option("-s, --status <s>", "Status filter")
  .option("-p, --priority <p>", "Priority filter")
  .option("-t, --tag <tag>", "Tag filter")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);

    const filter: any = {};
    if (opts.status) filter.status = opts.status;
    if (opts.priority) filter.priority = opts.priority;
    if (opts.tag) filter.tag = opts.tag;

    const list = tm.list(filter);

    if (list.length === 0) {
      console.log(`  ${icon.pending} No tasks found.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Tasks (${list.length})\n`));

    const prioIcon: Record<string, string> = {
      critical: brand.red("▲▲"),
      high: brand.gold("▲ "),
      medium: brand.cyan("● "),
      low: brand.dim("○ "),
    };

    const statusIcon: Record<string, string> = {
      backlog: brand.dim("□"),
      ready: brand.cyan("◇"),
      in_progress: brand.gold("◉"),
      review: brand.purple("◈"),
      done: icon.done,
      blocked: icon.block,
      cancelled: brand.dim("✕"),
    };

    for (const t of list) {
      const si = statusIcon[t.status] ?? "•";
      const pi = prioIcon[t.priority] ?? "  ";
      const tags = t.tags.length > 0 ? brand.dim(` [${t.tags.join(", ")}]`) : "";
      const effort = t.effort ? brand.dim(` (${t.effort}pt)`) : "";
      const deps = t.dependsOn.length > 0 ? brand.dim(` ← ${t.dependsOn.join(",")}`) : "";

      console.log(
        `  ${si} ${pi} ${brand.bold(t.id.padEnd(10))} ${t.title}${effort}${tags}${deps}`
      );

      if (t.subtaskIds.length > 0) {
        for (const subId of t.subtaskIds) {
          const sub = tm.get(subId);
          if (sub) {
            const subSi = statusIcon[sub.status] ?? "•";
            console.log(`     ${brand.dim("└")} ${subSi} ${brand.dim(sub.id.padEnd(10))} ${brand.dim(sub.title)}`);
          }
        }
      }
    }
    console.log("");
  });

taskCmd
  .command("show <id>")
  .description("Task details")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);

    const task = tm.get(id);
    if (!task) {
      console.log(`  ${icon.fail} Task not found: ${id}`);
      return;
    }

    const w = 50;
    console.log("");
    console.log(brand.gold(`  ╭${"─".repeat(w)}╮`));
    console.log(brand.gold(`  │`) + ` ${brand.bold(task.id)} — ${task.title}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  ├${"─".repeat(w)}┤`));
    console.log(brand.gold(`  │`) + `  Status:   ${task.status}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Priority: ${task.priority}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Type:     ${task.type}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Effort:   ${task.effort ?? "—"}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Tokens:   ${task.totalTokens}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  ╰${"─".repeat(w)}╯`));

    if (task.description !== task.title) {
      console.log(`\n  ${brand.dim("Description:")} ${task.description}`);
    }
    if (task.dependsOn.length > 0) {
      console.log(`  ${brand.dim("Dependencies:")} ${task.dependsOn.join(", ")}`);
    }
    if (task.tags.length > 0) {
      console.log(`  ${brand.dim("Tags:")} ${task.tags.join(", ")}`);
    }
    if (task.acceptanceCriteria.length > 0) {
      console.log(`  ${brand.dim("Acceptance Criteria:")}`);
      for (const c of task.acceptanceCriteria) {
        console.log(`     ${brand.dim("•")} ${c}`);
      }
    }
    if (task.chainIds.length > 0) {
      console.log(`  ${brand.dim("Chains:")} ${task.chainIds.join(", ")}`);
    }
    if (task.notes.length > 0) {
      console.log(`  ${brand.dim("Notes:")}`);
      for (const n of task.notes) {
        console.log(`     ${brand.dim(n)}`);
      }
    }
    if (task.blockedReason) {
      console.log(`  ${icon.block} ${brand.red(task.blockedReason)}`);
    }
    console.log("");
  });

taskCmd
  .command("done <id>")
  .description("Mark task as done")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    const task = tm.update(id, { status: "done" });
    console.log(`  ${icon.done} ${brand.bold(task.id)} ${brand.green("completed")}`);
  });

taskCmd
  .command("block <id>")
  .description("Block a task")
  .option("-d, --dir <path>", "Project directory")
  .option("-r, --reason <text>", "Block reason")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    const task = tm.update(id, { status: "blocked", blockedReason: opts.reason ?? "Blocked" });
    console.log(`  ${icon.block} ${brand.bold(task.id)} ${brand.red("blocked")}: ${opts.reason ?? ""}`);
  });

taskCmd
  .command("note <id> <text>")
  .description("Add a note to a task")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, text: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    tm.addNote(id, text);
    console.log(`  ${icon.done} Note added → ${brand.bold(id)}`);
  });

// ─── BOARD (Kanban) ───────────────────────────────────────────

program
  .command("board")
  .description("Kanban board view")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);

    const all = tm.list();
    if (all.length === 0) {
      console.log(`  ${icon.pending} No tasks found.`);
      return;
    }

    const columns: Record<string, typeof all> = {
      "📋 BACKLOG": [],
      "🔵 READY": [],
      "🟡 IN PROGRESS": [],
      "🟣 REVIEW": [],
      "✅ DONE": [],
      "🚫 BLOCKED": [],
    };

    const colMap: Record<string, string> = {
      backlog: "📋 BACKLOG",
      ready: "🔵 READY",
      in_progress: "🟡 IN PROGRESS",
      review: "🟣 REVIEW",
      done: "✅ DONE",
      blocked: "🚫 BLOCKED",
      cancelled: "✅ DONE",
    };

    for (const t of all) {
      if (!t.parentTaskId) { // top-level tasks
        const col = colMap[t.status] ?? "📋 BACKLOG";
        columns[col].push(t);
      }
    }

    // Auto-detect ready tasks
    for (const t of columns["📋 BACKLOG"]) {
      if (tm.isReady(t.id)) {
        columns["🔵 READY"].push(t);
      }
    }
    columns["📋 BACKLOG"] = columns["📋 BACKLOG"].filter(t => !tm.isReady(t.id));

    console.log(brand.gold("\n    ◆ Kanban Board\n"));
    forgeDivider();

    for (const [col, tasks] of Object.entries(columns)) {
      if (tasks.length === 0) continue;

      console.log(`  ${col} (${tasks.length})`);
      console.log(`  ${"─".repeat(40)}`);

      for (const t of tasks) {
        const prioMark = t.priority === "critical" ? brand.red("▲▲") :
          t.priority === "high" ? brand.gold("▲ ") :
            t.priority === "medium" ? brand.cyan("● ") : brand.dim("○ ");
        const effort = t.effort ? brand.dim(` ${t.effort}pt`) : "";
        console.log(`  ${prioMark} ${brand.bold(t.id)} ${t.title}${effort}`);

        // Show subtasks
        for (const subId of t.subtaskIds) {
          const sub = tm.get(subId);
          if (sub) {
            const subIcon = sub.status === "done" ? icon.done :
              sub.status === "blocked" ? icon.block : icon.pending;
            console.log(`     ${brand.dim("└")} ${subIcon} ${brand.dim(sub.title)}`);
          }
        }
      }
      console.log("");
    }

    // Stats
    const stats = tm.stats();
    const bar = "█".repeat(Math.round(stats.progress / 5)) + "░".repeat(20 - Math.round(stats.progress / 5));
    console.log(`  ${brand.dim("Progress:")} ${brand.green(bar)} ${stats.progress}%`);
    console.log(`  ${brand.dim(`${stats.byStatus["done"] ?? 0}/${stats.total} done, ${stats.totalEffort} effort pts, ${stats.totalTokens} tokens`)}`);

    if (stats.blockers.length > 0) {
      console.log(`\n  ${icon.block} ${brand.red("Blockers:")}`);
      for (const b of stats.blockers) {
        console.log(`     ${brand.bold(b.id)} ${b.title}: ${brand.dim(b.reason)}`);
      }
    }
    console.log("");
  });

// ─── INTERNALS (dev/debug only) ───────────────────────────────

const intCmd = program
  .command("internals")
  .alias("int")
  .description("Developer tools (debug/inspect)");

intCmd
  .command("thoughts")
  .description("List thoughts")
  .option("-c, --chain <id>", "Chain ID filter")
  .option("-s, --status <status>", "Status filter")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: { chain?: string; status?: string; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new ThoughtManager(projectRoot);

    const filter: any = {};
    if (opts.chain) filter.chainId = opts.chain;
    if (opts.status) filter.status = opts.status;

    const list = tm.list(filter);

    if (list.length === 0) {
      console.log(`  ${icon.pending} No thoughts found.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Thoughts (${list.length})\n`));
    for (const t of list) {
      const statusIcon = t.status === "done" ? icon.done
        : t.status === "blocked" ? icon.block
          : icon.pending;
      const layerIcon = icon[t.layer as keyof typeof icon] ?? "•";
      const conf = t.confidence > 0
        ? brand.dim(` ${(t.confidence * 100).toFixed(0)}%`)
        : "";

      console.log(
        `  ${statusIcon} ${brand.bold(t.id.padEnd(8))} ${layerIcon} ${brand.dim(t.layer.padEnd(11))} ${t.input.slice(0, 40)}${conf}`
      );
    }
    console.log("");
  });

intCmd
  .command("chains")
  .description("List chains")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const cm = new ChainManager(projectRoot);

    const list = cm.list();

    if (list.length === 0) {
      console.log(`  ${icon.pending} No chains found.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Chains (${list.length})\n`));
    for (const c of list) {
      const statusIcon = c.status === "completed" ? icon.done
        : c.status === "blocked" ? icon.block
          : icon.active;

      console.log(`  ${statusIcon} ${brand.bold(c.id.padEnd(25))} ${brand.gold(c.name)}`);
      console.log(`     ${brand.dim(`${c.thoughts.length} thoughts`)} ${icon.arrow} ${brand.dim(c.goal.slice(0, 40))}`);
    }
    console.log("");
  });

intCmd
  .command("history")
  .description("State transition history")
  .option("-n, --count <n>", "Number of transitions", "10")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: { count: string; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = StateManager.load(projectRoot, false);

    if (!sm) {
      console.log(`  ${icon.fail} No Foreman project found.`);
      return;
    }

    const history = sm.recentHistory(parseInt(opts.count));

    if (history.length === 0) {
      console.log(`  ${icon.pending} No transitions yet.`);
      return;
    }

    console.log(brand.gold("\n  ◆ State Transitions\n"));
    for (const h of history) {
      const time = brand.dim(h.at.slice(11, 19));
      const from = brand.dim(h.from);
      const to = brand.cyan(h.to);
      const ctx = [h.thoughtId, h.chainId].filter(Boolean).join(", ");

      console.log(`  ${time}  ${from} ${icon.arrow} ${to}`);
      console.log(`  ${brand.dim("         ")}${brand.dim(h.reason)}`);
      if (ctx) console.log(`  ${brand.dim("         ")}${brand.purple(ctx)}`);
    }
    console.log("");
  });

intCmd
  .command("memory")
  .alias("mem")
  .description("List memories")
  .option("-d, --dir <path>", "Project directory")
  .option("-c, --category <cat>", "Category filter")
  .option("--hot", "Hot memory only")
  .option("-q, --query <q>", "Search")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const mm = new MemoryManager(projectRoot);

    if (opts.query) {
      const results = mm.search(opts.query);
      if (results.length === 0) {
        console.log(`  ${icon.pending} No results found: "${opts.query}"`);
        return;
      }
      console.log(brand.gold(`\n  ◆ Search: "${opts.query}" (${results.length} results)\n`));
      for (const r of results.slice(0, 10)) {
        const score = brand.dim(`${(r.score * 100).toFixed(0)}%`);
        console.log(`  ${score} ${brand.bold(r.entry.id)} [${r.entry.category}] ${r.entry.content.slice(0, 50)}`);
      }
      console.log("");
      return;
    }

    const filter: any = {};
    if (opts.category) filter.category = opts.category;
    if (opts.hot) filter.minImportance = 0.8;

    const list = mm.list(filter);
    if (list.length === 0) {
      console.log(`  ${icon.pending} No memories found.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Memory (${list.length})\n`));
    for (const e of list) {
      const tempIcon = e.importance >= 0.8 ? "🔥" : e.importance >= 0.5 ? "📌" : "📝";
      const uses = e.useCount > 0 ? brand.dim(` (${e.useCount}×)`) : "";
      const tags = e.tags.length > 0 ? brand.dim(` [${e.tags.join(",")}]`) : "";
      console.log(`  ${tempIcon} ${brand.bold(e.id.padEnd(8))} ${brand.cyan(`[${e.category}]`.padEnd(14))} ${e.content.slice(0, 45)}${uses}${tags}`);
    }
    console.log("");
  });

intCmd
  .command("sessions")
  .description("List sessions")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = new SessionManager(projectRoot);
    const list = sm.list();

    if (list.length === 0) {
      console.log(`  ${icon.pending} No sessions found.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Sessions (${list.length})\n`));
    for (const s of list) {
      const si = s.status === "active" ? brand.green("●") :
        s.status === "completed" ? icon.done : brand.dim("○");
      const dur = s.endedAt
        ? brand.dim(` ${Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)}min`)
        : brand.green(" active");
      console.log(`  ${si} ${brand.bold(s.id)} ${brand.dim(s.startedAt.slice(0, 16))}${dur} ${icon.thought}${s.thoughtIds.length} ${icon.token}${s.totalTokens}`);
      if (s.summary) console.log(`     ${brand.dim(s.summary.slice(0, 60))}`);
    }
    console.log("");
  });

intCmd
  .command("cache")
  .description("Cache statistics")
  .option("-d, --dir <path>", "Project directory")
  .option("--clear", "Clear cache")
  .option("--purge", "Purge expired entries")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const cm = new CacheManager(projectRoot);

    if (opts.clear) {
      const cleared = cm.clear();
      console.log(`  ${icon.done} ${cleared} cache entries cleared.`);
      return;
    }

    if (opts.purge) {
      const purged = cm.purgeExpired();
      console.log(`  ${icon.done} ${purged} expired entries purged.`);
      return;
    }

    const s = cm.stats();
    console.log(brand.gold("\n  ◆ Cache Stats\n"));
    console.log(`  ${s.enabled ? brand.green("Enabled") : brand.red("Disabled")}`);
    console.log(`  Entries: ${brand.bold(String(s.entries))}/${s.maxEntries}`);
    console.log(`  Hits:    ${brand.bold(String(s.totalHits))}`);
    console.log(`  ${icon.token} Saved:  ${brand.green(String(s.totalTokensSaved))} tokens`);
    if (Object.keys(s.byLayer).length > 0) {
      console.log(`  ${brand.dim("By layer:")} ${Object.entries(s.byLayer).map(([k, v]) => `${k}(${v})`).join(", ")}`);
    }
    console.log("");
  });

intCmd
  .command("providers")
  .description("Provider status")
  .action(() => {
    console.log(brand.gold("\n  ◆ Provider Status\n"));
    printProviderStatus();
    console.log("");
  });
intCmd
  .command("approvals")
  .description("Approval engine audit trail")
  .option("-d, --dir <path>", "Project directory")
  .option("-n, --limit <count>", "Max entries", "20")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const auditPath = join(projectRoot, ".foreman", "approvals.json");
    if (!existsSync(auditPath)) {
      console.log(`  ${icon.pending} No approval history yet.`);
      return;
    }
    const data = safeJsonParseOr(readFileSync(auditPath, "utf-8"), { history: [] });
    const history = (data.history ?? []).slice(-Number(opts.limit));
    console.log(brand.gold(`\n  ◆ Approval History (${history.length} entries)\n`));
    for (const h of history) {
      const si = h.decision === "allow" ? brand.green("✔") : brand.red("✖");
      const risk = h.riskScore !== undefined ? brand.dim(` risk:${(h.riskScore * 100).toFixed(0)}%`) : "";
      console.log(`  ${si} ${brand.bold(h.command?.slice(0, 50) ?? "?")}${risk} ${brand.dim(`[${h.layer ?? "?"}]`)}`);
    }
    console.log("");
  });

// ── PROCESSES ──

intCmd
  .command("processes")
  .description("List running and finished processes")
  .option("-d, --dir <path>", "Project directory")
  .option("--running", "Show only running")
  .option("--finished", "Show only finished")
  .option("--chain <id>", "Filter by chain")
  .option("--layer <layer>", "Filter by layer")
  .option("--thought <id>", "Filter by thought")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    if (opts.running) {
      const procs = engine.listRunningProcesses();
      console.log(brand.gold(`\n  ◆ Running Processes (${procs.length})\n`));
      for (const p of procs) {
        console.log(`  ${icon.pending} ${brand.bold(p.id.slice(0, 8))} ${brand.dim(p.command?.slice(0, 50) ?? "?")}`);
      }
    } else if (opts.finished) {
      const procs = engine.listFinishedProcesses();
      console.log(brand.gold(`\n  ◆ Finished Processes (${procs.length})\n`));
      for (const p of procs) {
        const si = p.exitCode === 0 ? brand.green("✔") : brand.red("✖");
        console.log(`  ${si} ${brand.bold(p.id.slice(0, 8))} exit:${p.exitCode} ${brand.dim(p.command?.slice(0, 50) ?? "?")}`);
      }
    } else if (opts.chain) {
      const procs = engine.listProcessesByChain(opts.chain);
      console.log(brand.gold(`\n  ◆ Chain ${opts.chain} Processes (${procs.length})\n`));
      for (const p of procs) {
        console.log(`  • ${brand.bold(p.id.slice(0, 8))} ${brand.dim(p.command?.slice(0, 50) ?? "?")}`);
      }
    } else if (opts.layer) {
      const procs = engine.listProcessesByLayer(opts.layer);
      console.log(brand.gold(`\n  ◆ Layer ${opts.layer} Processes (${procs.length})\n`));
      for (const p of procs) {
        console.log(`  • ${brand.bold(p.id.slice(0, 8))} ${brand.dim(p.command?.slice(0, 50) ?? "?")}`);
      }
    } else if (opts.thought) {
      const procs = engine.listProcessesByThought(opts.thought);
      console.log(brand.gold(`\n  ◆ Thought ${opts.thought} Processes (${procs.length})\n`));
      for (const p of procs) {
        console.log(`  • ${brand.bold(p.id.slice(0, 8))} ${brand.dim(p.command?.slice(0, 50) ?? "?")}`);
      }
    } else {
      const stats = engine.processStats();
      console.log(brand.gold(`\n  ◆ Process Stats\n`));
      console.log(`  Running:  ${stats.running}`);
      console.log(`  Finished: ${stats.finished}`);
      console.log(`  Total:    ${stats.total}`);
    }
    console.log("");
    engine.shutdown();
  });

// ─── CONFIG ───────────────────────────────────────────────────

program
  .command("config")
  .description("Manage Foreman configuration")
  .option("--telegram-token <token>", "Set Telegram bot token")
  .option("--telegram-enabled <bool>", "Enable/disable Telegram", "true")
  .option("--show", "Show current configuration")
  .action(async (opts: any) => {
    const { loadConfig, saveConfig, getTelegramToken } = await import("./config.js");

    if (opts.show) {
      const config = loadConfig();
      console.log(brand.gold("\n  ◆ Foreman Configuration\n"));
      console.log(`  Config file: ~/.foreman/config.json`);
      console.log("");
      console.log("  Telegram:");
      console.log(`    Token: ${getTelegramToken() ? brand.green("✓ configured") : brand.dim("not set")}`);
      console.log(`    Enabled: ${config.telegram?.enabled !== false ? brand.green("yes") : brand.red("no")}`);
      console.log("");
      console.log("  Environment variables (override config):");
      console.log(`    FOREMAN_TELEGRAM_TOKEN: ${process.env.FOREMAN_TELEGRAM_TOKEN ? brand.green("✓ set") : brand.dim("not set")}`);
      console.log("");
      return;
    }

    if (opts.telegramToken) {
      const config = loadConfig();
      if (!config.telegram) config.telegram = {};
      config.telegram.botToken = opts.telegramToken;
      config.telegram.enabled = opts.telegramEnabled !== "false";

      saveConfig(config);
      console.log(brand.gold("\n  ◆ Configuration Updated\n"));
      console.log(`  Telegram token saved: ${brand.green("✓")}`);
      console.log(`  Telegram enabled: ${config.telegram.enabled ? brand.green("yes") : brand.red("no")}`);
      console.log("");
      console.log(`  ${brand.dim("Run 'foreman' to start with Telegram auto-activation")}`);
      console.log("");
      return;
    }

    // Default: show help
    console.log(brand.gold("\n  ◆ Foreman Config\n"));
    console.log("  Usage:");
    console.log(`    ${brand.cyan("foreman config --show")}                    ${brand.dim("# show current config")}`);
    console.log(`    ${brand.cyan("foreman config --telegram-token <token>")}  ${brand.dim("# save Telegram token")}`);
    console.log(`    ${brand.cyan("foreman config --telegram-enabled false")}  ${brand.dim("# disable Telegram")}`);
    console.log("");
  });

// ── PROCESS INSPECT ──

intCmd
  .command("process <id>")
  .description("Inspect or poll a specific process")
  .option("-d, --dir <path>", "Project directory")
  .option("--poll", "Wait for process to finish")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    if (opts.poll) {
      const result = engine.pollProcess(id);
      if (result) {
        console.log(brand.gold(`\n  ◆ Process ${id}\n`));
        console.log(`  Status: ${result.exitCode === 0 ? "success" : "failed"}`);
        console.log(`  Exit:   ${result.exitCode}`);
        if (result.stdout) console.log(`  Stdout: ${result.stdout.slice(0, 200)}`);
      } else {
        console.log(`  ${icon.pending} Process ${id} not found or still running.`);
      }
    } else {
      const proc = engine.getProcess(id);
      if (proc) {
        console.log(brand.gold(`\n  ◆ Process ${id}\n`));
        console.log(`  Command:  ${proc.command ?? "?"}`);
        console.log(`  Status:   ${proc.exitCode !== undefined ? `exit ${proc.exitCode}` : "running"}`);
      } else {
        console.log(`  ${icon.pending} Process ${id} not found.`);
      }
    }
    console.log("");
    engine.shutdown();
  });

// ── KILL PROCESSES ──

intCmd
  .command("kill-processes")
  .description("Kill processes by layer or thought")
  .option("-d, --dir <path>", "Project directory")
  .option("--layer <layer>", "Kill by layer")
  .option("--thought <id>", "Kill by thought")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    if (opts.layer) {
      engine.killProcessesByLayer(opts.layer);
      console.log(`  ${brand.green("✔")} Killed processes for layer: ${opts.layer}`);
    } else if (opts.thought) {
      engine.killProcessesByThought(opts.thought);
      console.log(`  ${brand.green("✔")} Killed processes for thought: ${opts.thought}`);
    } else {
      console.log(`  ${icon.block} Specify --layer or --thought`);
    }
    engine.shutdown();
  });

// ── GIT BRANCHES ──

intCmd
  .command("branches")
  .description("List branches and task branches")
  .option("-d, --dir <path>", "Project directory")
  .option("--task", "Show only task branches")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    if (opts.task) {
      const branches = engine.listTaskBranches();
      console.log(brand.gold(`\n  ◆ Task Branches (${branches.length})\n`));
      for (const b of branches) {
        console.log(`  • ${brand.bold(b)}`);
      }
    } else {
      const info = engine.getBranches();
      console.log(brand.gold(`\n  ◆ Git Branches\n`));
      console.log(`  Current: ${brand.bold(info.current)}`);
      for (const b of info.all) {
        const marker = b === info.current ? brand.green(" ◄") : "";
        console.log(`  • ${b}${marker}`);
      }
    }
    console.log("");
    engine.shutdown();
  });

// ── GIT HISTORY ──

intCmd
  .command("git-history <chainId>")
  .description("Show git history for a chain")
  .option("-d, --dir <path>", "Project directory")
  .action((chainId: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    const history = engine.getChainHistory(chainId);
    console.log(brand.gold(`\n  ◆ Chain ${chainId} Git History\n`));
    for (const entry of history) {
      console.log(`  ${brand.dim(entry.hash?.slice(0, 7) ?? "?")} ${entry.message?.slice(0, 60) ?? "?"}`);
    }
    console.log("");
    engine.shutdown();
  });

// ── SWITCH BRANCH ──

intCmd
  .command("switch-branch <branch>")
  .description("Switch git branch")
  .option("-d, --dir <path>", "Project directory")
  .action((branch: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    const result = engine.switchBranch(branch);
    if (result.success) {
      console.log(`  ${brand.green("✔")} Switched to: ${branch}`);
    } else {
      console.log(`  ${brand.red("✖")} Failed: ${result.error ?? "unknown"}`);
    }
    engine.shutdown();
  });

// ── MEMORY COMMANDS ──

intCmd
  .command("recall <query>")
  .description("Search memories by semantic similarity")
  .option("-d, --dir <path>", "Project directory")
  .option("-n, --limit <count>", "Max results", "5")
  .action((query: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    const results = engine.recall(query, Number(opts.limit));
    console.log(brand.gold(`\n  ◆ Memory Recall: "${query}" (${results.length} results)\n`));
    for (const r of results) {
      console.log(`  [${(r.score * 100).toFixed(0)}%] ${r.content.slice(0, 80)}`);
    }
    console.log("");
    engine.shutdown();
  });

intCmd
  .command("memory-export")
  .description("Generate structured memory document")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    const doc = engine.generateMemoryDocument();
    console.log(doc);
    engine.shutdown();
  });

intCmd
  .command("memory-import <file>")
  .description("Parse and import a memory document")
  .option("-d, --dir <path>", "Project directory")
  .action((file: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    if (!existsSync(file)) {
      console.log(`  ${brand.red("✖")} File not found: ${file}`);
      return;
    }
    const content = readFileSync(file, "utf-8");
    const entries = engine.parseMemoryDocument(content);
    console.log(brand.gold(`\n  ◆ Parsed ${entries.length} memory entries\n`));
    for (const e of entries) {
      console.log(`  • [${e.category}] ${e.content.slice(0, 60)} ${brand.dim(`tags: ${e.tags.join(", ")}`)}`);
    }
    console.log("");
    engine.shutdown();
  });

intCmd
  .command("memory-categorize")
  .description("Generate category-based memory files")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    engine.generateCategoryMemoryFiles();
    console.log(`  ${brand.green("✔")} Category memory files generated.`);
    engine.shutdown();
  });

// ── CONFIG COMMANDS ──

intCmd
  .command("queue-concurrency <lane> <max>")
  .description("Set command queue concurrency for a lane")
  .option("-d, --dir <path>", "Project directory")
  .action((lane: string, max: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    engine.setQueueConcurrency(lane, Number(max));
    console.log(`  ${brand.green("✔")} Queue lane "${lane}" concurrency set to ${max}`);
    engine.shutdown();
  });

intCmd
  .command("scheduler <id> <enabled>")
  .description("Enable/disable a scheduler task")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, enabled: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    engine.setScheduleEnabled(id, enabled === "true" || enabled === "on");
    console.log(`  ${brand.green("✔")} Scheduler "${id}" → ${enabled}`);
    engine.shutdown();
  });

intCmd
  .command("allowlist")
  .description("Show approval engine allowlist")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    const list = engine.getApprovalAllowlist();
    console.log(brand.gold(`\n  ◆ Approval Allowlist (${list.length} patterns)\n`));
    for (const pattern of list) {
      console.log(`  ${brand.green("✔")} ${pattern}`);
    }
    console.log("");
    engine.shutdown();
  });

// ── QUICK EDIT ──

intCmd
  .command("edit <file>")
  .description("Quick file edit via Engine")
  .requiredOption("--old <text>", "Text to find")
  .requiredOption("--new <text>", "Replacement text")
  .option("-d, --dir <path>", "Project directory")
  .action((file: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    const result = engine.quickEdit(join(projectRoot, file), opts.old, opts.new);
    if (result.success) {
      console.log(`  ${brand.green("✔")} Edited: ${file}`);
    } else {
      console.log(`  ${brand.red("✖")} Edit failed: ${result.error ?? "unknown"}`);
    }
    engine.shutdown();
  });

// ── DELAYED TASK ──

intCmd
  .command("delay <id> <ms>")
  .description("Add a delayed task to the scheduler")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, ms: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    engine.addDelayedTask(id, Number(ms), () => {
      console.log(`  ${brand.green("✔")} Delayed task "${id}" fired.`);
    });
    console.log(`  ${icon.pending} Delayed task "${id}" scheduled for ${ms}ms.`);
    // Note: process will exit before timer fires in CLI mode — useful for testing API
    engine.shutdown();
  });

// ── RATE LIMIT RESET ──

intCmd
  .command("reset-budget")
  .description("Reset rate limiter chain budget")
  .option("-d, --dir <path>", "Project directory")
  .option("--model", "Also reset model fallback")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const engine = new Engine({ projectRoot, projectName: "cli" });

    engine.resetChainBudget();
    if (opts.model) {
      engine.resetModel();
      console.log(`  ${brand.green("✔")} Chain budget + model fallback reset.`);
    } else {
      console.log(`  ${brand.green("✔")} Chain budget reset.`);
    }
    engine.shutdown();
  });

// ─── PROJECTS ─────────────────────────────────────────────────

const projectCmd = program
  .command("project")
  .description("Project management");

projectCmd
  .command("list")
  .description("List projects")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const pm = new ProjectManager(projectRoot);
    const projects = pm.list();

    if (projects.length === 0) {
      console.log(`  ${icon.pending} No projects found.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Projects (${projects.length})\n`));
    for (const p of projects) {
      const si = p.status === "active" ? brand.green("●") : brand.dim("○");
      console.log(`  ${si} ${brand.bold(p.name)} ${brand.dim(`[${p.id}]`)}`);
      if (p.description && p.description !== p.name) {
        console.log(`     ${brand.dim(p.description.slice(0, 60))}`);
      }
    }
    console.log("");
  });

projectCmd
  .command("show <id>")
  .description("Show project details")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const pm = new ProjectManager(projectRoot);
    const project = pm.get(id);

    if (!project) {
      console.log(`  ${icon.fail} Project not found: ${id}`);
      return;
    }

    console.log(brand.gold(`\n  ◆ ${project.name}\n`));
    console.log(`  ID:     ${brand.dim(project.id)}`);
    console.log(`  Status: ${project.status === "active" ? brand.green("active") : brand.dim(project.status)}`);
    if (project.description) console.log(`  Desc:   ${project.description}`);
    if (project.vision) console.log(`  Vision: ${project.vision.slice(0, 80)}`);
    console.log("");
  });

projectCmd
  .command("switch <id>")
  .description("Switch active project")
  .option("-d, --dir <path>", "Project directory")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const pm = new ProjectManager(projectRoot);
    const project = pm.get(id);

    if (!project) {
      console.log(`  ${icon.fail} Project not found: ${id}`);
      return;
    }

    // Update project status to active, mark others as completed
    for (const p of pm.list()) {
      if (p.id === id) {
        pm.update(p.id, { status: "active" });
      } else if (p.status === "active") {
        pm.update(p.id, { status: "completed" });
      }
    }

    console.log(`  ${icon.done} Switched to: ${brand.bold(project.name)}`);
  });

// ─── SECURITY SCAN ────────────────────────────────────────────

program
  .command("scan")
  .description("Security scan — detect secrets, missing .gitignore entries, permissions")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const result = scanProject(projectRoot);

    console.log(brand.gold("\n  ◆ Security Scan\n"));
    console.log(`  Scanned ${brand.bold(String(result.scannedFiles))} files in ${result.duration}ms`);
    console.log(`  Critical: ${result.summary.critical > 0 ? brand.red(String(result.summary.critical)) : brand.green("0")} | High: ${result.summary.high > 0 ? brand.red(String(result.summary.high)) : brand.green("0")} | Medium: ${brand.bold(String(result.summary.medium))} | Low: ${brand.dim(String(result.summary.low))}`);

    if (result.findings.length > 0) {
      console.log("");
      for (const f of result.findings.slice(0, 25)) {
        const sev = f.severity === "critical" ? brand.red(`[${f.severity.toUpperCase()}]`) :
          f.severity === "high" ? brand.red(`[${f.severity.toUpperCase()}]`) :
            brand.dim(`[${f.severity.toUpperCase()}]`);
        console.log(`  ${sev} ${f.title}${f.file ? brand.dim(` — ${f.file}:${f.line ?? ""}`) : ""}`);
        if (f.suggestion) console.log(`    ${brand.dim("→")} ${f.suggestion}`);
      }
      if (result.findings.length > 25) {
        console.log(`  ${brand.dim(`... and ${result.findings.length - 25} more findings`)}`);
      }
    } else {
      console.log(`  ${icon.done} ${brand.green("No security issues found!")}`);
    }
    console.log("");
  });

// ─── CHAIN REPAIR ─────────────────────────────────────────────

program
  .command("repair")
  .description("Repair thought chains — fix orphans, stale thoughts, duplicates")
  .option("-d, --dir <path>", "Project directory")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const chains = new ChainManager(projectRoot);
    const thoughtsMgr = new ThoughtManager(projectRoot);
    const allChains = chains.list();

    console.log(brand.gold(`\n  ◆ Chain Repair (${allChains.length} chains)\n`));

    let totalIssues = 0;
    for (const chain of allChains) {
      const chainThoughts = chain.thoughts
        .map((id: string) => thoughtsMgr.get(id))
        .filter((t: any) => t !== null);

      const health = checkChainHealth(chainThoughts);
      const transcript = repairTranscript(chainThoughts);

      const issues = health.issueCount + transcript.report.totalRepairs;
      totalIssues += issues;

      const si = health.healthy && transcript.report.totalRepairs === 0
        ? icon.done
        : brand.red("✖");
      console.log(`  ${si} ${brand.bold(chain.id)} ${brand.dim(chain.name)} — ${issues > 0 ? brand.red(`${issues} issues`) : brand.green("healthy")}`);

      if (health.issues.length > 0) {
        for (const issue of health.issues.slice(0, 5)) {
          console.log(`    ${brand.dim("→")} ${issue.type}: ${issue.description}`);
        }
      }
      if (transcript.report.totalRepairs > 0) {
        console.log(`    ${brand.dim("→")} transcript: ${transcript.report.droppedOrphanResults} orphan results, ${transcript.report.droppedOrphanCalls} orphan calls, ${transcript.report.repairedContextRefs} broken refs`);
      }
    }

    console.log("");
    if (totalIssues === 0) {
      console.log(`  ${icon.done} ${brand.green("All chains healthy!")}`);
    } else {
      console.log(`  ${brand.red(`${totalIssues} total issues found`)}`);
    }

    // Git conflict check against main branch
    try {
      const exec = new ExecutionEngine(projectRoot);
      const git = new GitEngine(exec);
      const branchResult = exec.runShell("git branch --show-current");
      const currentBranch = branchResult.stdout?.trim() ?? "";

      if (currentBranch && currentBranch !== "main" && currentBranch !== "master") {
        const mainBranch = exec.runShell("git rev-parse --verify main 2>/dev/null").success ? "main" : "master";
        const conflicts = git.checkConflicts(mainBranch);
        if (conflicts.hasConflicts) {
          console.log(`  ${brand.red("⚠")} ${brand.bold("Git conflicts")} with ${mainBranch}: ${conflicts.conflictingFiles.length} files`);
          for (const f of conflicts.conflictingFiles.slice(0, 5)) {
            console.log(`    ${brand.dim("→")} ${f}`);
          }
        } else {
          console.log(`  ${icon.done} ${brand.green(`Clean merge with ${mainBranch}`)}`);
        }
      }

      // Foreman commit history
      const foremanHistory = git.getForemanHistory(5);
      if (foremanHistory.length > 0) {
        console.log(`\n  ${brand.gold("◆ Recent Foreman Commits")}`);
        for (const entry of foremanHistory) {
          console.log(`  ${brand.dim(entry.hash.slice(0, 7))} ${entry.message.slice(0, 60)}`);
        }
      }
    } catch {
      // Non-git project — skip
    }

    console.log("");
  });

// ─── ROLLBACK ─────────────────────────────────────────────────

program
  .command("rollback <hash>")
  .description("Rollback a specific thought's commit by hash")
  .option("-d, --dir <path>", "Project directory")
  .option("-t, --thought <id>", "Thought ID (for metadata)")
  .action((hash: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const exec = new ExecutionEngine(projectRoot);
    const git = new GitEngine(exec);
    const thoughtId = opts.thought ?? "unknown";

    console.log(brand.gold(`\n  ◆ Rollback: ${hash.slice(0, 7)}\n`));

    const result = git.rollbackThought(hash, thoughtId);
    if (result.success) {
      console.log(`  ${icon.done} ${brand.green("Rollback successful")}`);
      console.log(`  ${brand.dim("Revert commit:")} ${result.revertHash?.slice(0, 7) ?? "ok"}`);
    } else {
      console.log(`  ${icon.fail} ${brand.red("Rollback failed")}`);
      console.log(`  ${brand.dim(result.error ?? "Unknown error")}`);
    }
    console.log("");
  });

// ─── SERVE (Messaging Gateway) ───────────────────────────────

program
  .command("serve")
  .description("Start the messaging gateway (Telegram, WhatsApp)")
  .option("-d, --dir <path>", "Project directory")
  .option("--telegram <token>", "Telegram bot token")
  .option("--whatsapp", "Enable WhatsApp channel")
  .option("--whatsapp-session <dir>", "WhatsApp session directory")
  .option("--allow <ids...>", "Allowed sender IDs")
  .action(async (opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const { MessagingGateway } = await import("./messaging-gateway.js");
    const { ChannelConfig, TelegramChannelConfig, WhatsAppChannelConfig } = await import("./channel.js");

    printLogo();
    console.log(brand.gold("\n  ◆ Foreman Messaging Gateway\n"));

    const channels: any[] = [];
    const allowedSenders: string[] = opts.allow ?? [];

    // Telegram
    const tgToken = opts.telegram ?? process.env.FOREMAN_TELEGRAM_TOKEN;
    if (tgToken) {
      channels.push({
        type: "telegram",
        enabled: true,
        botToken: tgToken,
        allowedSenders,
      });
      console.log(`  ${brand.green("✔")} Telegram channel configured`);
    }

    // WhatsApp
    if (opts.whatsapp || process.env.FOREMAN_WHATSAPP === "true") {
      channels.push({
        type: "whatsapp",
        enabled: true,
        sessionDir: opts.whatsappSession ?? join(homedir(), ".foreman"),
        allowedSenders,
      });
      console.log(`  ${brand.green("✔")} WhatsApp channel configured`);
    }

    if (channels.length === 0) {
      console.log(`  ${brand.red("✖")} No channels configured.`);
      console.log(`  ${brand.dim("  Use --telegram <token> or --whatsapp")}`);
      console.log(`  ${brand.dim("  Or set FOREMAN_TELEGRAM_TOKEN / FOREMAN_WHATSAPP=true")}`);
      process.exit(1);
    }

    const gateway = new MessagingGateway({
      projectRoot,
      projectName: "foreman",
      channels,
      maxConcurrent: 5,
      messageTimeoutMs: 120_000,
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n  Shutting down...");
      await gateway.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await gateway.start();

    // Show live status
    const channelCount = gateway.getActiveChannels();
    console.log(brand.gold(`\n  🔥 Gateway running — ${channelCount} channel(s) active`));
    console.log(`  ${brand.dim(`Conversations: ${gateway.getConversationCount()} | Running: ${gateway.isRunning()}`)}`);

    // Periodic status ticker
    const statusInterval = setInterval(() => {
      if (!gateway.isRunning()) {
        clearInterval(statusInterval);
        return;
      }
      const convs = gateway.getConversationCount();
      if (convs > 0) {
        console.log(`  ${brand.dim(`[heartbeat] ${convs} active conversation(s)`)}`);
      }
    }, 300_000); // every 5 min
    statusInterval.unref();

    console.log(`  ${brand.dim("Press Ctrl+C to stop.\n")}`);

    // Check channel health periodically
    const healthInterval = setInterval(() => {
      if (!gateway.isRunning()) {
        clearInterval(healthInterval);
        return;
      }
      for (const type of ["telegram", "whatsapp"] as const) {
        const ch = gateway.getChannel(type);
        if (ch && !ch.isConnected()) {
          console.log(`  ${brand.red("⚠")} ${type} channel disconnected!`);
        }
      }
    }, 60_000);
    healthInterval.unref();
  });

// ─── PARSE ────────────────────────────────────────────────────

program.parseAsync();
