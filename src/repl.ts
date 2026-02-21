/**
 * FOREMAN — Interactive REPL (Chat Mode)
 *
 * A cinematic, forge-themed conversational interface.
 * The forge is always burning — sparks, embers, hammers.
 *
 * Features:
 *   - Streaming LLM responses via Antigravity SSE
 *   - Project context auto-detection
 *   - Conversation history (in-memory)
 *   - Slash commands (/model, /models, /forge, /status, /clear, /exit)
 *   - Forge-themed spinner while waiting for LLM
 *   - Typewriter streaming for responses
 *   - Animated transitions on model switch, forge start, exit
 */

import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  AntigravityProvider,
  loadCredentials,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  refreshChatModels,
} from "./antigravity-provider.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { createToolExecutor } from "./tools.js";
import { runOnboarding } from "./onboarding.js";
import {
  brand, icon, grad, SPARK_LINES,
} from "./theme.js";
import {
  startForgeSpinner,
  animatePhaseTransition,
  typeText,
  sleep,
} from "./animations.js";

// ─── ANSI HELPERS ────────────────────────────────────────────

const ESC = "\x1b[";
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_LINE = `${ESC}2K`;
const MOVE_UP = (n: number) => `${ESC}${n}A`;

// ─── TYPES ───────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ReplState {
  model: string;
  messages: ChatMessage[];
  provider: AntigravityProvider | null;
  projectName: string;
  projectInfo: string;
  totalTokens: number;
  rl: ReadlineInterface | null;
  running: boolean;
  toolExecutor: (call: ToolCall) => ToolResult;
}



// ─── PROJECT DETECTION ───────────────────────────────────────

function detectProject(cwd: string): { name: string; info: string; fileTree: string } {
  let name = basename(cwd);
  const infoParts: string[] = [];
  const files: string[] = [];

  // package.json
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) name = pkg.name;
      if (pkg.description) infoParts.push(`Description: ${pkg.description}`);
      if (pkg.version) infoParts.push(`Version: ${pkg.version}`);
      const deps = Object.keys(pkg.dependencies ?? {}).length;
      const devDeps = Object.keys(pkg.devDependencies ?? {}).length;
      if (deps + devDeps > 0) infoParts.push(`Dependencies: ${deps} prod, ${devDeps} dev`);
    } catch { /* ignore */ }
  }

  // state.json (Foreman project)
  const statePath = join(cwd, "state.json");
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      if (state.projectName) name = state.projectName;
      infoParts.push(`Foreman project: ${state.currentState ?? "idle"}`);
    } catch { /* ignore */ }
  }

  // Build a shallow file tree (max 2 levels, max 40 entries)
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (count >= 40) { files.push("  ..."); break; }
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isDirectory()) {
        files.push(`  ${entry.name}/`);
        count++;
        // One level deeper
        try {
          const subEntries = readdirSync(join(cwd, entry.name), { withFileTypes: true });
          for (const sub of subEntries.slice(0, 8)) {
            if (sub.name.startsWith(".")) continue;
            files.push(`    ${sub.name}${sub.isDirectory() ? "/" : ""}`);
            count++;
            if (count >= 40) break;
          }
          if (subEntries.length > 8) { files.push("    ..."); count++; }
        } catch { /* ignore */ }
      } else {
        files.push(`  ${entry.name}`);
        count++;
      }
    }
  } catch { /* ignore */ }

  const info = infoParts.length > 0
    ? infoParts.join("\n")
    : `Directory: ${cwd}`;

  return { name, info, fileTree: files.join("\n") };
}

// ─── SYSTEM PROMPT ───────────────────────────────────────────

function buildSystemPrompt(projectName: string, projectInfo: string, fileTree: string): string {
  const cwd = process.cwd();
  return `You are Foreman — an AI coding assistant that runs in the terminal with full filesystem and shell access.

TOOLS AVAILABLE:
- bash: Run shell commands (build, test, git, install, etc.)
- read_file: Read file contents (supports line ranges)
- write_file: Create or overwrite files (creates directories automatically)
- edit_file: Make targeted string replacements in existing files
- search_files: Find files by name/glob pattern
- grep: Search file contents for text/regex patterns
- list_dir: List directory contents with sizes

WORKFLOW — Think atomically, act precisely:
1. UNDERSTAND — Read relevant files first. Never guess at file contents.
2. PLAN — Think about the minimal set of changes needed.
3. EXECUTE — Use tools to make changes. One focused action at a time.
4. VERIFY — Run builds/tests after changes when possible.

RULES:
- ALWAYS use write_file or edit_file to create/modify files. NEVER print code for the user to copy.
- Be concise in text responses. Let your tool actions do the talking.
- When editing, read the file first so you know the exact content to replace.
- After making changes, verify by running relevant commands (build, test, lint).
- If a task is complex, break it into small steps and execute them one at a time.

Working directory: ${cwd}
Project: ${projectName}
${projectInfo}

Files in project:
${fileTree}`;
}

// ─── DISPLAY HELPERS ─────────────────────────────────────────

function printStatusBar(state: ReplState) {
  const modelEntry = CHAT_MODELS.find(m => m.id === state.model);
  const modelLabel = modelEntry ? modelEntry.label : state.model;
  const msgCount = state.messages.filter(m => m.role !== "system").length;

  console.log("");
  console.log(
    `    ${brand.steel("⚒")} ${brand.dim("Model:")} ${brand.goldBright(modelLabel)}`
    + `  ${brand.dim("│")}  ${brand.dim("Project:")} ${brand.cyan(state.projectName)}`
    + `  ${brand.dim("│")}  ${brand.gold("✦")} ${brand.dim(`${msgCount} messages`)}`,
  );
  console.log("");
}

function printSparkDivider() {
  const idx = Math.random() < 0.5 ? 0 : 1;
  console.log(`    ${SPARK_LINES[idx]}`);
}

function printModelList(currentModel: string) {
  console.log("");
  console.log(`    ${brand.gold("◆ Available Models")}`);
  console.log(`    ${brand.dim("─".repeat(44))}`);
  for (const m of CHAT_MODELS) {
    const active = m.id === currentModel ? brand.green(" ● active") : "";
    console.log(`    ${brand.cyan(m.id.padEnd(22))} ${brand.dim(m.label)}${active}`);
  }
  console.log("");
}

// ─── EXIT ANIMATION ──────────────────────────────────────────

async function animateExit() {
  process.stdout.write(HIDE_CURSOR);
  console.log("");

  // Fading embers
  const frames = [
    `    ${brand.orange("( ( (")} ${brand.ember("🔥")} ${brand.orange(") ) )")}`,
    `    ${brand.dim("  ( (")} ${brand.ember("🔥")} ${brand.dim(") )  ")}`,
    `    ${brand.dim("    (")} ${brand.dim("·")} ${brand.dim(")    ")}`,
    `    ${brand.dim("      ·        ")}`,
  ];

  for (const frame of frames) {
    console.log(frame);
    await sleep(200);
  }

  console.log("");
  await typeText("    The forge cools... until next time, smith.", 30, brand.dim);
  console.log("");
  process.stdout.write(SHOW_CURSOR);
}

// ─── MODEL SWITCH ANIMATION ─────────────────────────────────

async function animateModelSwitch(oldModel: string, newModel: string) {
  const oldEntry = CHAT_MODELS.find(m => m.id === oldModel);
  const newEntry = CHAT_MODELS.find(m => m.id === newModel);
  const oldLabel = oldEntry ? oldEntry.label : oldModel;
  const newLabel = newEntry ? newEntry.label : newModel;

  await animatePhaseTransition(oldLabel, newLabel);

  console.log(`    ${icon.done} ${brand.gold("Model switched:")} ${brand.goldBright(newLabel)}`);
  console.log("");
}



// ─── SLASH COMMAND HANDLERS ──────────────────────────────────

async function handleSlashCommand(
  input: string,
  state: ReplState,
): Promise<"continue" | "exit"> {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "exit":
    case "quit":
    case "q":
      return "exit";

    case "forge":
    case "run":
    case "go":
      // Forge is now integrated — just tell the user
      console.log(`    ${icon.done} ${brand.green("Tools are always active — just type your request!")}`);
      console.log(`    ${brand.dim("Foreman will automatically read/write files and run commands.")}`);
      console.log("");
      return "continue";

    case "clear":
      // Keep only system prompt
      state.messages = state.messages.filter(m => m.role === "system");
      state.totalTokens = 0;
      console.log(`    ${icon.done} ${brand.green("Conversation cleared — fresh metal on the anvil.")}`);
      console.log("");
      return "continue";

    case "model":
      if (arg) {
        const match = CHAT_MODELS.find(m => m.id === arg || m.label.toLowerCase() === arg.toLowerCase());
        if (match) {
          const oldModel = state.model;
          state.model = match.id;
          if (process.stdout.isTTY) {
            await animateModelSwitch(oldModel, match.id);
          } else {
            console.log(`    ${icon.done} Model → ${brand.goldBright(match.label)}`);
          }
        } else {
          console.log(`    ${icon.fail} ${brand.red("Unknown model:")} ${arg}`);
          printModelList(state.model);
        }
      } else {
        // Interactive model selection
        printModelList(state.model);
        console.log(`    ${brand.dim("Usage:")} ${brand.cyan("/model <name>")}`);
        console.log("");
      }
      return "continue";

    case "models":
      printModelList(state.model);
      return "continue";

    case "status":
      printStatusBar(state);
      // Token usage
      if (state.totalTokens > 0) {
        console.log(`    ${icon.token} ${brand.dim("Total tokens used:")} ${brand.bold(String(state.totalTokens))}`);
        console.log("");
      }
      return "continue";

    case "help":
      console.log("");
      console.log(`    ${brand.gold("◆ Forge Commands")}`);
      console.log(`    ${brand.dim("─".repeat(44))}`);
      console.log(`    ${brand.cyan("/model <name>")}   ${brand.dim("Switch model")}`);
      console.log(`    ${brand.cyan("/models")}         ${brand.dim("List available models")}`);
      console.log(`    ${brand.cyan("/tools")}          ${brand.dim("List available tools")}`);
      console.log(`    ${brand.cyan("/status")}         ${brand.dim("Show session status")}`);
      console.log(`    ${brand.cyan("/clear")}          ${brand.dim("Clear conversation history")}`);
      console.log(`    ${brand.cyan("/help")}           ${brand.dim("Show this help")}`);
      console.log(`    ${brand.cyan("/exit")}           ${brand.dim("Exit (or Ctrl+C)")}`);
      console.log("");
      console.log(`    ${brand.dim("Just type your request — Foreman will use tools automatically.")}`);
      console.log("");
      return "continue";

    case "tools":
      console.log("");
      console.log(`    ${brand.gold("◆ Available Tools")}`);
      console.log(`    ${brand.dim("─".repeat(44))}`);
      console.log(`    ${brand.cyan("bash")}            ${brand.dim("Run shell commands")}`);
      console.log(`    ${brand.cyan("read_file")}       ${brand.dim("Read file contents")}`);
      console.log(`    ${brand.cyan("write_file")}      ${brand.dim("Create or overwrite files")}`);
      console.log(`    ${brand.cyan("edit_file")}       ${brand.dim("Surgical edit with fuzzy match")}`);
      console.log(`    ${brand.cyan("search_files")}    ${brand.dim("Find files by name pattern")}`);
      console.log(`    ${brand.cyan("grep")}            ${brand.dim("Search file contents")}`);
      console.log(`    ${brand.cyan("list_dir")}        ${brand.dim("List directory contents")}`);
      console.log(`    ${brand.cyan("batch_write")}     ${brand.dim("Atomic multi-file writes")}`);
      console.log(`    ${brand.cyan("git_status")}      ${brand.dim("Git status")}`);
      console.log(`    ${brand.cyan("git_commit")}      ${brand.dim("Git commit")}`);
      console.log(`    ${brand.cyan("security_scan")}   ${brand.dim("Project security scan")}`);
      console.log(`    ${brand.cyan("verify_build")}    ${brand.dim("Parse build output for errors")}`);
      console.log(`    ${brand.cyan("verify_tests")}    ${brand.dim("Parse test output")}`);
      console.log(`    ${brand.cyan("web_search")}      ${brand.dim("Search project files")}`);
      console.log(`    ${brand.cyan("web_fetch")}       ${brand.dim("Fetch URL content")}`);
      console.log(`    ${brand.cyan("analyze_link")}    ${brand.dim("Classify and analyze URLs")}`);
      console.log(`    ${brand.cyan("parse_markdown")}  ${brand.dim("Extract code/tables/sections")}`);
      console.log(`    ${brand.cyan("list_processes")} ${brand.dim("Active background processes")}`);
      console.log(`    ${brand.cyan("approval_audit")}${brand.dim(" Command approval history")}`);
      console.log(`    ${brand.cyan("git_diff")}       ${brand.dim("Classified git diff analysis")}`);
      console.log(`    ${brand.cyan("edit_range")}     ${brand.dim("Replace content by line range")}`);
      console.log(`    ${brand.cyan("edit_undo")}      ${brand.dim("Undo last edit on a file")}`);
      console.log("");
      console.log(`    ${brand.dim("Foreman uses these automatically based on your requests.")}`);
      console.log("");
      return "continue";

    default:
      console.log(`    ${icon.warn} ${brand.dim("Unknown command:")} /${cmd}`);
      console.log(`    ${brand.dim("Type")} ${brand.cyan("/help")} ${brand.dim("for available commands.")}`);
      console.log("");
      return "continue";
  }
}

// ─── CHAT TURN ───────────────────────────────────────────────

async function handleChatTurn(input: string, state: ReplState): Promise<void> {
  if (!state.provider) {
    console.log(`    ${icon.fail} ${brand.red("No LLM provider available. Run")} ${brand.cyan("foreman login")}`);
    return;
  }

  // Add user message
  state.messages.push({ role: "user", content: input });

  // Spark divider between user input and response
  printSparkDivider();

  // Start forge spinner while waiting
  const spinner = startForgeSpinner();

  try {
    let firstToken = true;
    let responseText = "";

    const result = await state.provider.streamChatWithTools(
      state.messages,
      state.model,
      (token: string) => {
        if (firstToken) {
          spinner.stop();
          process.stdout.write(`\n    ${brand.gold("🔥 foreman ›")} `);
          firstToken = false;
        }
        process.stdout.write(token);
        responseText += token;
      },
      (call: ToolCall) => {
        if (firstToken) {
          spinner.stop();
          firstToken = false;
        }
        const argsPreview = call.args.command ?? call.args.path ?? call.args.pattern ?? call.args.directory ?? ".";
        console.log(`\n    ${brand.cyan("⚙")} ${brand.bold(call.name)} ${brand.dim(String(argsPreview).slice(0, 80))}`);
      },
      (result: ToolResult) => {
        const lines = result.content.split("\n");
        const preview = lines.slice(0, 3).join("\n      ");
        const remaining = lines.length - 3;
        const statusIcon = result.isError ? icon.fail : icon.done;
        console.log(`      ${statusIcon} ${brand.dim(preview.slice(0, 300))}`);
        if (remaining > 0) {
          console.log(`      ${brand.dim(`... ${remaining} more lines`)}`);
        }
      },
      32768,
      25,
      state.toolExecutor,
    );

    if (firstToken) {
      // No tokens streamed — spinner still running
      spinner.stop();
      if (result.text) {
        process.stdout.write(`\n    ${brand.gold("🔥 foreman ›")} ${result.text}`);
        responseText = result.text;
      } else {
        console.log(`\n    ${brand.dim("(no response)")}`);
      }
    }

    // End response
    process.stdout.write("\n");

    // Track tokens
    state.totalTokens += (result.inputTokens + result.outputTokens);

    // Add assistant message to history
    state.messages.push({ role: "assistant", content: responseText });

    // Token usage line
    console.log(
      `    ${brand.dim("─")} ${icon.token} ${brand.dim(`${result.inputTokens}→${result.outputTokens} tokens`)}`,
    );

  } catch (err: any) {
    spinner.stop();

    const msg = err.message || String(err);

    if (msg.includes("401") || msg.includes("403") || msg.includes("refresh")) {
      console.log(`\n    ${icon.fail} ${brand.red("Auth expired.")} Run ${brand.cyan("foreman login")} to re-authenticate.`);
    } else if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      console.log(`\n    ${icon.warn} ${brand.gold("Rate limited — the forge is too hot! Wait a moment.")}`);
    } else if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
      console.log(`\n    ${icon.fail} ${brand.red("Network error — the forge lost its connection.")}`);
      console.log(`    ${brand.dim(msg.slice(0, 100))}`);
    } else {
      console.log(`\n    ${icon.fail} ${brand.red(msg.slice(0, 120))}`);
    }
  }

  console.log("");
}

// ─── MAIN REPL ───────────────────────────────────────────────

export async function startRepl(): Promise<void> {
  const cwd = process.cwd();

  // Detect project
  const project = detectProject(cwd);

  // Load credentials
  let creds = loadCredentials();
  if (!creds || Date.now() >= creds.expiresAt) {
    // Try onboarding
    console.log("");
    console.log(`    ${icon.warn} ${brand.gold("No active credentials — the forge needs fuel.")}`);
    console.log("");
    const success = await runOnboarding();
    if (!success) {
      console.log(`    ${icon.fail} ${brand.red("Setup not completed.")}`);
      console.log(`    ${brand.dim("Run")} ${brand.cyan("foreman login")} ${brand.dim("to authenticate.")}`);
      console.log("");
      return;
    }
    creds = loadCredentials();
  }

  // Create provider
  let provider: AntigravityProvider | null = null;
  if (creds) {
    try {
      provider = new AntigravityProvider(creds);
      // Discover models from API in background (non-blocking)
      refreshChatModels(creds).catch(() => {/* silent */ });
    } catch (err: any) {
      console.log(`    ${icon.fail} ${brand.red("Failed to initialize provider:")} ${brand.dim(err.message)}`);
    }
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(project.name, project.info, project.fileTree);

  // Build tool executor — bound to project root for security
  const toolExecutor = createToolExecutor(cwd);

  // State
  const state: ReplState = {
    model: DEFAULT_CHAT_MODEL,
    messages: [{ role: "system", content: systemPrompt }],
    provider,
    projectName: project.name,
    projectInfo: project.info,
    totalTokens: 0,
    rl: null,
    running: true,
    toolExecutor,
  };

  // ── Startup sequence ──
  if (process.stdout.isTTY) {
    await typeText("    ⚒ The forge is lit. Speak your mind.", 25, brand.gold);
  } else {
    console.log(`    ${brand.gold("⚒ The forge is lit. Speak your mind.")}`);
  }

  printStatusBar(state);

  console.log(`    ${brand.dim("Type a message, or")} ${brand.cyan("/help")} ${brand.dim("for commands.")}`);
  console.log("");

  // ── Readline setup ──
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });
  state.rl = rl;

  const promptStr = `    ${brand.cyan("⚒ you ›")} `;

  // Graceful Ctrl+C
  rl.on("close", async () => {
    if (state.running) {
      state.running = false;
      if (process.stdout.isTTY) {
        await animateExit();
      } else {
        console.log(`\n    ${brand.dim("The forge cools... until next time, smith.")}`);
      }
      process.exit(0);
    }
  });

  // ── REPL loop ──
  const askQuestion = (): void => {
    if (!state.running) return;

    rl.question(promptStr, async (rawInput: string) => {
      const input = rawInput.trim();

      // Empty input — just re-prompt
      if (!input) {
        askQuestion();
        return;
      }

      // Slash commands
      if (input.startsWith("/")) {
        const result = await handleSlashCommand(input, state);
        if (result === "exit") {
          state.running = false;
          rl.close();
          return;
        }
        askQuestion();
        return;
      }

      // Normal chat (everything goes through tools now)
      await handleChatTurn(input, state);
      askQuestion();
    });
  };

  askQuestion();
}

