# Foreman

> AI agent orchestrator — atomic thought chains with vision, research, and tactical reasoning.

Foreman is a full-stack, fully autonomous coding agent and orchestration engine. It doesn't just autocomplete code; it builds entire features, refactors architecture, researches context, executes terminal commands, verifies tests, takes UI screenshots, and communicates with you via CLI, REPL, Telegram, or WhatsApp.

Unlike chatbots that spit out code blocks for you to copy-paste, Foreman operates directly in your project directory. You give it a high-level task, and it creates a vision, decomposes it into tactical blocks, reads the codebase, atomizes the execution steps, runs them, verifies the result, and commits the code.

## 1. Core Capabilities

* **End-to-End Orchestration**: Tell it to `"Refactor the authentication flow"` or `"Build a kanban board UI"`. It breaks the task down, runs bash commands, edits files directly, and verifies its own work.
* **Self-Healing & Rollback**: If an atomic code change breaks the build or fails tests, the `VerificationEngine` and `ReviewerGate` detect it. Foreman attempts to fix the issue autonomously. If it fails, the `RollbackEngine` reverts the specific git commit and restores the project to a clean state.
* **Visual QA**: When changing CSS or UI layouts, Foreman uses its `BrowserEngine` (headless Chrome) to take "before" and "after" screenshots. It compares them using `pixelmatch` (an SSIM-grade perceptual diffing library) to verify visual impact and detect layout drift.
* **Parallel Sub-Agents**: Complex tasks can spawn concurrent Sub-Agents (`SubAgentEngine`) to handle side-tasks, research, or isolated component development in parallel.
* **Multi-Channel Presence**: Run it in your terminal via the CLI, interact through an interactive REPL, or deploy the `MessagingGateway` to control your agent remotely via Telegram or WhatsApp.

## 2. Architecture: The Forge Pipeline

Foreman processes complex tasks through the **Forge Pipeline**, a 4-layer cognitive architecture designed to manage context and prevent hallucinations.

*Total Codebase: ~46,600 LOC across 121 TypeScript files.*

### The Layers
1. **Visioner**: High-level semantic understanding. Takes user input and writes a detailed Vision Document. Receives the largest context window budget (40%).
2. **Strategist**: Tactical planner. Decomposes the vision into ordered, actionable Blocks.
3. **Researcher**: Context gatherer. Analyzes the codebase, reads docs, searches the web, and pulls vector embeddings for the current block.
4. **Worker**: Execution engine. Translates a block into precise "Atoms", issues tool calls (writes, edits, bash commands), verifies tests, and commits the code.

### The Subsystems (44 Engines & Managers)
Foreman is built around a highly modular engine architecture containing 44 major subsystems. Core engines include:
* **CognitiveLoadBalancer**: A multi-provider load balancer. When one LLM provider hits a rate limit (HTTP 429), it instantly routes to the next (e.g., Anthropic API $\rightarrow$ Google Gemini $\rightarrow$ OpenAI) with zero sleep and zero downtime.
* **ExecutionEngine & GitEngine**: Manages git safety, atomic commits, branch strategies, and safe shell execution.
* **ApprovalEngine & ReviewerGate**: Evaluates the quality, risk score, and safety of generated commands/code before committing.
* **BrowserEngine & MediaEngine**: Drives headless browsing, DOM extraction, PDF generation, and perceptual diffing.
* **CronEngine & TaskScheduler**: Handles background job scheduling and asynchronous processes.
* **MemoryManager & EmbeddingEngine**: Manages long-term memory bridging to markdown for persistent context retention using TF-IDF and semantic embeddings.
* **ContextIntelligence & LinkIntelligence**: Dynamically scores and prunes context, ensuring maximum relevance within the token budget.

### The Toolbelt (48 Native Tools)
Foreman dynamically loads tools based on the current layer's needs. The active system contains exactly **48 tools**, including:
* *File Ops*: `read_file`, `write_file`, `edit_file`, `edit_range`, `edit_undo`, `batch_write`, `batch_ops`, `delete_file`
* *Discovery*: `search_files`, `search_in_files`, `grep`, `list_dir`, `extract_code`, `parse_markdown`
* *System*: `bash`, `list_processes`, `kill_processes`, `cron_add`, `cron_list`, `cron_remove`
* *Version Control*: `git_status`, `git_commit`, `git_diff`, `git_log`, `diff_preview`
* *Verification*: `verify_build`, `verify_tests`, `security_scan`, `approval_audit`
* *Web & Browser*: `web_search`, `web_fetch`, `analyze_link`, `classify_url`, `browser_navigate`, `browser_screenshot`, `browser_extract`, `browser_pdf`, `download_file`, `analyze_media`
* *Agentic*: `forge_pipeline`, `spawn_subagent`, `session_spawn`, `session_list`
* *Memory*: `memory_read`, `memory_write`, `memory_search`, `semantic_search`, `cache_stats`

## 3. Installation & Usage

**Prerequisites:** Node.js $\ge$ 20.0, `tsx`

1. Clone the repository and install dependencies.
2. Setup environment variables (or use Antigravity OAuth for managed API keys).

```bash
npm install

# Set up your API keys (Anthropic, OpenAI, Google)
npx tsx src/cli.ts setup

# OR login with Antigravity OAuth
npx tsx src/cli.ts login
```

### CLI Options

**Initialize a project:**
```bash
npx tsx src/cli.ts init my-project
```

**Run a task directly through the Forge:**
```bash
npx tsx src/cli.ts run "Replace local state with Redux Toolkit across the dashboard"
```

**Interactive REPL:**
```bash
npx tsx src/cli.ts
# Drops you into the interactive prompt where you can chat, read files, or run tools directly.
```

**Developer / Internal Commands:**
```bash
npx tsx src/cli.ts status           # Show current project status
npx tsx src/cli.ts board            # Kanban board view of tasks
npx tsx src/cli.ts scan             # Security scan for leaked secrets and permissions
npx tsx src/cli.ts cache            # Inspect cache statistics
npx tsx src/cli.ts sessions         # List active sessions
```

### Remote Control (Telegram / WhatsApp)
You can deploy Foreman to a server and control it from your phone using the `MessagingGateway`:
```bash
npx tsx src/cli.ts serve
```
In Telegram/WhatsApp, you can type `/forge Build a new landing page` to kick off the full pipeline. The bot will reply with real-time updates as thoughts and commits flow, acting as your remote developer.

## 4. Testing & Reliability

Foreman is rigorously tested to ensure atomic safety and proper rollback mechanics.
* **Framework**: Native Node.js test runner (`node:test` & `node:assert`) executed via `tsx --test`.
* **Scale**: 38 test files containing ~850 individual tests.
* **Coverage**: Includes end-to-end simulations using `MockProvider` to run the entire pipeline without incurring LLM costs. Tests simulate HTTP 429 errors to verify the `CognitiveLoadBalancer`'s failover, and simulate failing builds to verify the `RollbackEngine`.

Run the test suite using:
```bash
npm test
```

## 5. Technical Highlights

* **Zero-Downtime Routing**: The `CognitiveLoadBalancer` ensures that API rate limits don't break multi-minute thought chains. It dynamically falls back across providers for the same model to guarantee highway-speed execution.
* **Perceptual Diffing**: `pixelmatch` integration allows the Worker layer to detect unintended CSS bleeding, layout shifts, or rendering errors that traditional testing misses.
* **Precise AST-Aware Edits**: The `edit_range` and `edit_file` tools prevent full-file rewrites. This saves massive amounts of tokens, drastically reduces context-window hallucinations, and keeps git diffs clean.
* **Self-Healing Transcripts**: LLMs occasionally output malformed JSON or invalid tool calls. `TranscriptRepair` and `ChainRepair` engines automatically fix formatting, recover broken JSON, and prune orphan thoughts.
* **Security Scanner**: Built-in AST-based secret detection prevents the Worker from accidentally committing hardcoded API keys or sensitive data during autonomous execution.
