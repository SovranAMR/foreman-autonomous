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
import {
  KimiProvider,
  loadKimiKey,
  KIMI_MODELS,
  DEFAULT_KIMI_MODEL,
} from "./kimi-provider.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { createToolExecutor, createEngineToolExecutor, TOOL_DEFINITIONS } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";
import { EditEngine } from "./edit-engine.js";
import { GitEngine } from "./git-engine.js";
import { LinkIntelligence } from "./link-intelligence.js";
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
  provider: AntigravityProvider | KimiProvider | null;
  projectName: string;
  projectInfo: string;
  totalTokens: number;
  rl: ReadlineInterface | null;
  running: boolean;
  toolExecutor: (call: ToolCall) => ToolResult | Promise<ToolResult>;
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
  return `<identity>
You are Foreman — an AI coding assistant running in the terminal with full filesystem and shell access.
You are an autonomous agent — keep working with tools until the task is FULLY complete.
Do NOT stop and ask the user what to do next. Just do it.
</identity>

<tools>
Filesystem: read_file, write_file, edit_file, search_files, grep, list_dir
Execution: bash (builds, tests, git, any shell command)
Verification: verify_build, verify_tests, security_scan
Web: web_search, web_fetch
Git: git_status, git_commit
Every tool call MUST include an "explanation" parameter — justify WHY you're using it.
</tools>

<workflow>
For EVERY request, follow this order strictly:
1. OKU — Read relevant files first. NEVER guess file contents. Use grep/search_files to find what you need.
2. PLANLA — Determine the minimal set of changes. Do NOT over-engineer.
3. UYGULA — Make changes with edit_file (preferred) or write_file. One file at a time.
4. DOĞRULA — Run verification: bash for build/test/lint. Changes are NOT done until verified.
If verification fails, fix the error and verify again. Do NOT declare success on failing builds.
</workflow>

<anti_hallucination>
CRITICAL — these rules are ABSOLUTE:
1. Your FIRST action in every turn MUST be a tool call. Text-only responses = FAILURE.
2. NEVER claim "I did X" without a corresponding tool call that proves it.
3. NEVER output code blocks for user to copy — use write_file/edit_file DIRECTLY.
4. NEVER tell user "run this command" — use bash tool YOURSELF.
5. NEVER describe what you WOULD do — DO it with tools RIGHT NOW.
6. If you encounter an error, do NOT just report it — FIX IT with tools.
7. After ANY code change, ALWAYS verify (bash: build, test, or ls).
8. ONE task at a time — complete and verify before starting the next.
9. If something fails repeatedly (3+ times), explain what's happening and try a different approach.
10. NEVER say "I'll help you with..." — just START DOING IT.
</anti_hallucination>

<self_correction>
Before finalizing your response, run this checklist:
□ Did I start with a tool call? If NO → add tool call before any text.
□ Did I claim any action? If YES → verify matching tool call exists.
□ Did I write code as text? If YES → move it into write_file/edit_file.
□ Did I suggest a command? If YES → run it myself with bash.
□ Did I verify my changes work? If NO → run bash verification now.
□ Did I encounter an error? If YES → fix it, don't just report.
□ If I said "I'm about to do X" → actually do X in THIS turn, not the next.
</self_correction>

<code_quality>
- Write MINIMAL code. Only what's needed to solve the problem.
- For edits, use edit_file with exact old_string matching — not full file rewrites.
- Read the file BEFORE editing — old_string must match exactly.
- Check for syntax errors before declaring done.
- Follow existing code style and patterns in the project.
</code_quality>

<debugging>
When fixing bugs or errors:
1. First check logs/output with bash to understand the actual error.
2. Read the relevant source files with read_file.
3. Identify the root cause — don't just patch symptoms.
4. Apply the fix with edit_file.
5. Verify the fix with bash (rerun the failing command).
6. If fix doesn't work, try a DIFFERENT approach — don't repeat the same fix.
</debugging>

<error_recovery>
If you encounter repeated failures:
- After 2 failed attempts → step back, re-read the code, try a fundamentally different approach.
- After 3 failed attempts → explain the situation clearly. List what you tried and what might be wrong.
- NEVER silently ignore errors. Every error must be addressed.
</error_recovery>

<communication>
- Be concise. Let tool actions do the talking.
- Lead with results, not explanations.
- Don't repeat yourself.
</communication>

<forbidden_patterns>
NEVER DO THESE:
❌ Showing code for user to copy (use write_file/edit_file)
❌ Telling user to run commands (use bash yourself)
❌ Long explanations without tool calls
❌ Asking "shall I do X?" when you can just do X
❌ Writing essays about what you plan to do
❌ Generating placeholder/stub code
</forbidden_patterns>

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
  cwd: string,
  gitEngine: GitEngine,
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

    case "branches": {
      try {
        const info = gitEngine.getBranches();
        console.log(brand.gold(`\n    ◆ Git Branches\n`));
        console.log(`    Current: ${brand.bold(info.current)}`);
        for (const b of info.local) {
          const marker = b === info.current ? brand.green(" ◄") : "";
          console.log(`    • ${b}${marker}`);
        }
        const taskBranches = gitEngine.listTaskBranches();
        if (taskBranches.length > 0) {
          console.log(`\n    Task branches: ${taskBranches.join(", ")}`);
        }
      } catch {
        console.log(`    ${brand.dim("Not a git repository.")}`);
      }
      console.log("");
      return "continue";
    }

    case "recall": {
      if (!arg) {
        console.log(`    ${brand.dim("Usage: /recall <query>")}`);
        return "continue";
      }
      const mm = new (await import("./memory-manager.js")).MemoryManager(cwd);
      const results = mm.search(arg).slice(0, 5);
      console.log(brand.gold(`\n    ◆ Memory Recall: "${arg}" (${results.length} results)\n`));
      for (const r of results) {
        console.log(`    [${(r.score * 100).toFixed(0)}%] ${r.entry.content.slice(0, 80)}`);
      }
      console.log("");
      return "continue";
    }

    case "processes": {
      const pr = new (await import("./process-registry.js")).ProcessRegistry();
      const stats = {
        running: pr.listRunning().length,
        finished: pr.listFinished().length,
        total: pr.listRunning().length + pr.listFinished().length,
      };
      console.log(brand.gold(`\n    ◆ Processes: ${stats.running} running, ${stats.finished} finished\n`));
      for (const p of pr.listRunning()) {
        console.log(`    ${icon.pending} ${brand.bold(p.id.slice(0, 8))} ${brand.dim(p.command?.slice(0, 50) ?? "?")}`);
      }
      console.log("");
      return "continue";
    }

    case "simple": {
      // Direct chat without tools — uses streamChat
      if (!arg) {
        console.log(`    ${brand.dim("Usage: /simple <message>")}`);
        return "continue";
      }
      const spinner = startForgeSpinner();
      try {
        let first = true;
        await state.provider!.streamChat(
          [...state.messages, { role: "user", content: arg }],
          state.model,
          (token: string) => {
            if (first) { spinner.stop(); process.stdout.write(`\n    ${brand.gold("💬")} `); first = false; }
            process.stdout.write(token);
          },
        );
        console.log("\n");
      } catch (err) {
        spinner.stop();
        console.log(`\n    ${brand.red("✖")} ${err}`);
      }
      return "continue";
    }

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
      console.log(`    ${brand.cyan("/branches")}       ${brand.dim("List git branches")}`);
      console.log(`    ${brand.cyan("/recall <query>")} ${brand.dim("Search memory")}`);
      console.log(`    ${brand.cyan("/processes")}      ${brand.dim("List running processes")}`);
      console.log(`    ${brand.cyan("/simple <msg>")}   ${brand.dim("Direct chat (no tools)")}`);
      console.log(`    ${brand.cyan("/clear")}          ${brand.dim("Clear conversation history")}`);
      console.log(`    ${brand.cyan("/help")}           ${brand.dim("Show this help")}`);
      console.log(`    ${brand.cyan("/exit")}           ${brand.dim("Exit (or Ctrl+C)")}`);
      console.log("");
      console.log(`    ${brand.dim("Just type your request — Foreman will use tools automatically.")}`);
      console.log("");
      return "continue";

    case "tools":
      console.log("");
      console.log(`    ${brand.gold(`◆ Available Tools (${TOOL_DEFINITIONS.length})`)}`);
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
      console.log(`    ${brand.cyan("classify_url")}   ${brand.dim("Classify URL type (github/npm/docs)")}`);
      console.log(`    ${brand.cyan("cache_stats")}    ${brand.dim("Web search/fetch cache statistics")}`);
      console.log(`    ${brand.cyan("extract_code")}   ${brand.dim("Extract inline code from text")}`);
      console.log(`    ${brand.cyan("delete_file")}    ${brand.dim("Delete a file")}`);
      console.log(`    ${brand.cyan("search_in_files")}${brand.dim(" Search pattern across files")}`);
      console.log(`    ${brand.cyan("kill_processes")} ${brand.dim("Kill all background processes")}`);
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

/** Track models tried in current turn to prevent infinite loops */
const _triedModels = new Set<string>();

async function handleChatTurn(input: string, state: ReplState): Promise<void> {
  if (!state.provider) {
    console.log(`    ${icon.fail} ${brand.red("No LLM provider available. Run")} ${brand.cyan("foreman login")}`);
    return;
  }

  // Reset tried models on first call (not a retry)
  if (!_triedModels.has(state.model)) {
    _triedModels.clear();
  }
  _triedModels.add(state.model);

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
        const a = call.args ?? {};
        const argsPreview = a.command ?? a.path ?? a.pattern ?? a.directory ?? ".";
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

    // Handle empty response — try next model
    if (!result.text || result.text.trim().length === 0) {
      spinner.stop();
      const nextModel = findNextUntried(state.model);
      if (nextModel) {
        console.log(`\n    ${icon.warn} ${brand.gold(`${state.model} returned empty response`)}`);
        console.log(`    ${brand.dim("⚡ Auto-switching to")} ${brand.goldBright(nextModel.label)}${brand.dim("...")}`);
        state.model = nextModel.id;
        state.messages.pop(); // remove user msg for retry
        return handleChatTurn(input, state);
      }
      console.log(`\n    ${brand.dim("(no response)")}`);
    }

    if (firstToken) {
      spinner.stop();
      if (result.text) {
        process.stdout.write(`\n    ${brand.gold("🔥 foreman ›")} ${result.text}`);
        responseText = result.text;
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

    // Clear tried models on success
    _triedModels.clear();

  } catch (err: any) {
    spinner.stop();

    const msg = err.message || String(err);

    // ─── AUTO-FALLBACK: 400/503/capacity → try next untried model ───
    if (msg.includes("400") || msg.includes("503") || msg.includes("No capacity") || msg.includes("empty")) {
      const nextModel = findNextUntried(state.model);
      if (nextModel) {
        console.log(`\n    ${icon.warn} ${brand.gold(`${state.model} unavailable (${msg.includes("503") ? "no capacity" : "error"})`)}`);
        console.log(`    ${brand.dim("⚡ Auto-switching to")} ${brand.goldBright(nextModel.label)}${brand.dim("...")}`);
        state.model = nextModel.id;
        state.messages.pop();
        return handleChatTurn(input, state);
      }
    }

    if (msg.includes("401") || msg.includes("403") || msg.includes("refresh")) {
      console.log(`\n    ${icon.fail} ${brand.red("Auth expired.")} Run ${brand.cyan("foreman login")} to re-authenticate.`);
    } else if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      console.log(`\n    ${icon.warn} ${brand.gold("Rate limited — the forge is too hot! Wait a moment.")}`);
    } else if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
      console.log(`\n    ${icon.fail} ${brand.red("Network error — the forge lost its connection.")}`);
      console.log(`    ${brand.dim(msg.slice(0, 100))}`);
    } else {
      console.log(`\n    ${icon.fail} ${brand.red(msg.slice(0, 200))}`);
    }

    _triedModels.clear();
  }

  console.log("");
}

/** Find the next model in CHAT_MODELS that hasn't been tried yet */
function findNextUntried(currentModel: string): { id: string; label: string } | null {
  for (const m of CHAT_MODELS) {
    if (m.id !== currentModel && !_triedModels.has(m.id)) {
      _triedModels.add(m.id);
      return m;
    }
  }
  return null;
}

// ─── MAIN REPL ───────────────────────────────────────────────

export async function startRepl(): Promise<void> {
  const cwd = process.cwd();

  // Detect project
  const project = detectProject(cwd);

  // Load credentials — skip Antigravity onboarding if Kimi key exists
  const hasKimiKey = !!loadKimiKey();
  let creds = loadCredentials();
  if (!hasKimiKey && (!creds || Date.now() >= creds.expiresAt)) {
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

  // Create provider — Antigravity (Opus) first for smart tool calling, Kimi as fallback
  let provider: AntigravityProvider | KimiProvider | null = null;
  let activeModel = DEFAULT_CHAT_MODEL;
  let activeModelList = CHAT_MODELS;

  // Priority 1: Antigravity (Gemini 3.1 Pro High) — best for conversation + tool calling
  if (creds) {
    try {
      provider = new AntigravityProvider(creds);
      activeModel = "gemini-3.1-pro-high";
      // Discover models from API in background (non-blocking)
      refreshChatModels(creds).catch(() => {/* silent */ });
      console.log(`    ${icon.done} ${brand.gold("Gemini 3.1 Pro High loaded — powered by Antigravity")}`);
    } catch (err: any) {
      console.log(`    ${icon.fail} ${brand.red("Antigravity provider failed:")} ${brand.dim(err.message)}`);
    }
  }

  // Priority 2: Kimi K2 — fallback if no Antigravity credentials
  if (!provider) {
    const kimiKey = loadKimiKey();
    if (kimiKey) {
      try {
        provider = new KimiProvider(kimiKey);
        activeModel = DEFAULT_KIMI_MODEL;
        activeModelList = KIMI_MODELS.map(m => ({ ...m }));
        CHAT_MODELS.splice(0, CHAT_MODELS.length, ...KIMI_MODELS.map(m => ({ ...m })));
        console.log(`    ${icon.done} ${brand.gold("Kimi K2 loaded (fallback) — forge powered by Moonshot AI")}`);
      } catch (err: any) {
        console.log(`    ${icon.fail} ${brand.red("Kimi key invalid:")} ${brand.dim(err.message)}`);
      }
    }
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(project.name, project.info, project.fileTree);

  // Build tool executor — engine-connected for full subsystem integration
  const execEngine = new ExecutionEngine(cwd);
  const editEngine = new EditEngine();
  const gitEngine = new GitEngine(execEngine);
  const linkIntel = new LinkIntelligence();
  const toolExecutor = createEngineToolExecutor(cwd, execEngine, editEngine, gitEngine, linkIntel, undefined); // No hooks engine in REPL mode

  // State
  const state: ReplState = {
    model: activeModel,
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
        const result = await handleSlashCommand(input, state, cwd, gitEngine);
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

