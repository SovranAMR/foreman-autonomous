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
} from "./antigravity-provider.js";
import { runOnboarding } from "./onboarding.js";
import {
  brand, icon, grad, forgeDivider, SPARK_LINES,
} from "./theme.js";
import {
  startForgeSpinner,
  animatePhaseTransition,
  animateDwarf,
  animateSparkRain,
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
}

// ─── TRIGGER WORDS ───────────────────────────────────────────
// When the user says one of these, transition to pipeline mode.

const FORGE_TRIGGERS = [
  "do it", "build it", "forge it", "start", "başla",
  "run it", "execute", "make it", "ship it", "let's go",
  "hammer it", "fire it up",
];

function isForgeTriggered(input: string): boolean {
  const lower = input.toLowerCase().trim();
  return FORGE_TRIGGERS.some(t => lower === t || lower.startsWith(t + " "));
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
  return `You are Foreman, an AI coding assistant that lives in the terminal. You help developers plan, discuss, and build software projects.

You're in CHAT mode — have a natural conversation. Help the user think through their ideas, analyze their codebase, answer questions, and plan work.

When the user is ready to execute, they'll say "forge it", "do it", "build it" or use /forge.

Keep responses concise and useful. Use code blocks when showing code. Be direct.

Current project: ${projectName}
${projectInfo}

Files:
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

// ─── FORGE TRANSITION ────────────────────────────────────────

async function animateForgeTransition() {
  console.log("");
  console.log(`    ${brand.ember("╔══════════════════════════════════════╗")}`);
  console.log(`    ${brand.ember("║")} ${brand.gold("⚒")}  ${grad.forge("LIGHTING THE FORGE...")}              ${brand.ember("║")}`);
  console.log(`    ${brand.ember("╚══════════════════════════════════════╝")}`);
  console.log("");

  await animateDwarf(2500, 200);
  await animateSparkRain(50, 800, 120);
  console.log("");
}

// ─── SLASH COMMAND HANDLERS ──────────────────────────────────

async function handleSlashCommand(
  input: string,
  state: ReplState,
): Promise<"continue" | "exit" | "forge"> {
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
      return "forge";

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
      console.log(`    ${brand.cyan("/forge")}          ${brand.dim("Transition to pipeline mode")}`);
      console.log(`    ${brand.cyan("/status")}         ${brand.dim("Show session status")}`);
      console.log(`    ${brand.cyan("/clear")}          ${brand.dim("Clear conversation history")}`);
      console.log(`    ${brand.cyan("/help")}           ${brand.dim("Show this help")}`);
      console.log(`    ${brand.cyan("/exit")}           ${brand.dim("Exit (or Ctrl+C)")}`);
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

    const result = await state.provider.streamChat(
      state.messages,
      state.model,
      (token: string) => {
        if (firstToken) {
          // Stop spinner, print response prefix
          spinner.stop();
          process.stdout.write(`\n    ${brand.gold("🔥 foreman ›")} `);
          firstToken = false;
        }
        // Stream token directly to stdout
        process.stdout.write(token);
        responseText += token;
      },
      4096,
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

// ─── SUMMARIZE CONVERSATION ──────────────────────────────────
// For passing context when transitioning to pipeline /forge mode.

function summarizeConversation(messages: ChatMessage[]): string {
  const nonSystem = messages.filter(m => m.role !== "system");
  if (nonSystem.length === 0) return "";

  // Use the last few user messages to build a task summary
  const userMessages = nonSystem.filter(m => m.role === "user");
  const lastUserMsg = userMessages[userMessages.length - 1]?.content ?? "";

  // If there's an assistant summary, include that too
  const lastAssistant = nonSystem.filter(m => m.role === "assistant").pop();
  const assistantContext = lastAssistant
    ? `\n\nContext from conversation:\n${lastAssistant.content.slice(0, 500)}`
    : "";

  return `${lastUserMsg}${assistantContext}`;
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
    } catch (err: any) {
      console.log(`    ${icon.fail} ${brand.red("Failed to initialize provider:")} ${brand.dim(err.message)}`);
    }
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(project.name, project.info, project.fileTree);

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
        if (result === "forge") {
          state.running = false;
          rl.close();
          await transitionToForge(state);
          return;
        }
        askQuestion();
        return;
      }

      // Check for forge trigger phrases
      if (isForgeTriggered(input)) {
        state.running = false;
        rl.close();

        // Add the trigger as a user message for context
        state.messages.push({ role: "user", content: input });
        await transitionToForge(state);
        return;
      }

      // Normal chat
      await handleChatTurn(input, state);
      askQuestion();
    });
  };

  askQuestion();
}

// ─── FORGE TRANSITION ────────────────────────────────────────

async function transitionToForge(state: ReplState): Promise<void> {
  const task = summarizeConversation(state.messages);

  if (!task) {
    console.log(`    ${icon.warn} ${brand.gold("No task to forge — say something first!")}`);
    console.log("");
    return;
  }

  // Cinematic transition
  if (process.stdout.isTTY) {
    await animateForgeTransition();
  }

  console.log(`    ${brand.gold("◆ Transitioning to pipeline mode...")}`);
  console.log(`    ${brand.dim("Task:")} ${task.slice(0, 80)}${task.length > 80 ? "..." : ""}`);
  console.log("");
  console.log(`    ${brand.dim("Run:")} ${brand.cyan(`foreman run "${task.slice(0, 60).replace(/"/g, '\\"')}${task.length > 60 ? "..." : ""}"`)}`);
  console.log("");

  forgeDivider();
  console.log("");
}
