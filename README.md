# Foreman

**AI agent orchestrator that decomposes tasks into atomic, verifiable thought chains.**

4-layer cognitive pipeline: **Visioner → Strategist → Researcher → Worker**. Each layer produces structured output. Each atom is executed, verified, and recoverable.

```
  Visioner    →    Strategist    →    Researcher    →    Worker
  defines          decomposes         gathers            executes
  success          into atoms         context            & verifies
```

---

## What it does

You give it a task. It:

1. **Vision** — defines what "done" looks like (acceptance criteria, constraints)
2. **Decompose** — breaks it into 1-8 execution blocks, each block into atoms
3. **Research** — fetches docs, searches web, analyzes links for each block
4. **Execute** — runs each atom with real tools, verifies output, retries on failure

Not a chatbot wrapper. An execution engine with 49 tools, 5 LLM providers, and self-healing chains.

---

## Quick Start

```bash
git clone https://github.com/SovranAMR/foreman.git
cd foreman
npm install

# Set up API keys
npx tsx src/cli.ts setup

# Run a task
npx tsx src/cli.ts run "Build a REST API with Express"

# Interactive REPL
npx tsx src/cli.ts repl

# Start Telegram bot
npx tsx src/cli.ts serve --telegram '<BOT_TOKEN>' --allow <USER_ID>
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Engine (engine.ts)                      │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Provider │  │ Thought  │  │  Chain   │  │ Session  │ │
│  │ Registry │  │ Manager  │  │ Manager  │  │ Manager  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Execution │  │   Edit   │  │   Git    │  │  Memory  │ │
│  │ Engine   │  │  Engine  │  │  Engine  │  │ Manager  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Rate   │  │ Security │  │ Approval │  │ Rollback │ │
│  │ Limiter  │  │ Scanner  │  │  Engine  │  │  Engine  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                            │
│         Orchestrator (orchestrator.ts) — 1200 LOC          │
│         4-layer pipeline with reviewer gate                │
└──────────────────────────────────────────────────────────┘
```

### The 4 Layers

| Layer | File | What it does |
|-------|------|-------------|
| **Visioner** | `prompts.ts` | Defines GOAL, ACCEPTANCE CRITERIA, CONSTRAINTS. Adaptive: simple tasks get 3 lines, complex get full design docs. |
| **Strategist** | `prompts.ts` | Decomposes into blocks (max 8) and atoms (max 6 per block). Hard caps enforced in orchestrator. |
| **Researcher** | `research-engine.ts` | Web search, URL fetch, link analysis, project memory scan. Runs as sub-agent per block. |
| **Worker** | `worker-executor.ts` | Executes atoms using 8-step protocol. Extraction mode (1 LLM call + post-hoc parse) or tool mode. |

### Worker 8-Step Protocol

Every worker atom follows this exact structure:

```
STEP1_READ     → Read relevant files
STEP2_CONTEXT  → Understand scope
STEP3_IMPACT   → Assess side effects
STEP4_DECIDE   → Choose approach
STEP5_PREDICT  → Predict outcome
STEP6_EXECUTE  → Run operations (// Write to: path, $ command)
STEP7_VERIFY   → Verify results
STEP8_REPORT   → Report status
```

---

## Tools (49)

All real implementations, no mocks.

**File ops:** `read_file` `write_file` `edit_file` `edit_range` `edit_undo` `delete_file` `list_dir` `search_files` `search_in_files` `batch_write` `batch_ops`

**Execution:** `bash` `grep` `list_processes` `kill_processes` `verify_build` `verify_tests`

**Web:** `web_search` `web_fetch` `analyze_link` `classify_url` `browser_navigate` `browser_screenshot` `browser_extract` `browser_pdf` `download_file`

**Git:** `git_status` `git_diff` `git_log` `git_commit`

**Memory:** `memory_read` `memory_write` `memory_search` `semantic_search`

**Code:** `extract_code` `parse_markdown` `diff_preview`

**Orchestration:** `forge_pipeline` `spawn_subagent` `session_list` `session_spawn`

**System:** `cron_add` `cron_list` `cron_remove` `security_scan` `approval_audit` `cache_stats` `analyze_media`

---

## LLM Providers

| Provider | Module | Models |
|----------|--------|--------|
| **Kimi (Moonshot)** | `kimi-provider.ts` | kimi-k2.5, kimi-k2-thinking, kimi-k2-thinking-turbo |
| **Antigravity** | `antigravity-provider.ts` | gemini-3.1-pro-high, claude-sonnet, claude-opus + dynamic list |
| **OpenAI** | `openai-provider.ts` | gpt-4o, gpt-4o-mini |
| **Anthropic** | `anthropic-provider.ts` | claude-sonnet-4, claude-opus-4 |
| **Gemini** | `gemini-provider.ts` | gemini-2.5-pro, gemini-2.5-flash |

Provider registry with automatic fallback chain. 404 → try next model. 429 → exponential backoff (20s/40s/60s). Rate limiter: 10 RPM default.

---

## Messaging Gateway

```bash
# Telegram
npx tsx src/cli.ts serve --telegram '<BOT_TOKEN>' --allow <USER_ID>

# WhatsApp (Baileys)
npx tsx src/cli.ts serve --whatsapp --allow <PHONE>
```

- Natural chat — LLM decides when to use `forge_pipeline` tool vs direct tools
- Conversation persistence (`.foreman/conversations/`)
- 30-min TTL, `/clear` to reset
- Automatic compaction at 40K tokens
- Provider preference: Kimi key → Antigravity fallback

---

## CLI Commands

```
foreman setup              # Configure API keys
foreman login              # Antigravity OAuth
foreman init <name>        # New project scaffold
foreman status             # System health
foreman run <task>         # Full pipeline execution
foreman repl               # Interactive REPL
foreman task add/list/done # Task management
foreman board              # Kanban view
foreman doctor             # Health check
foreman scan               # Security scan
foreman repair             # Fix orphaned chains
foreman rollback <hash>    # Revert a commit
foreman serve              # Messaging gateway
foreman internals          # Debug: thoughts, chains, memory, sessions, cache
```

47 CLI commands, 16 REPL commands.

---

## Project Stats

| Metric | Value |
|--------|-------|
| Source files | 85 `.ts` modules (+ 38 test files) |
| Total LOC | ~47,500 |
| Tools | 49 |
| Tests | 807+ (0 failures) |
| CLI commands | 47 |
| LLM providers | 5 |
| Git commits | 214+ |
| Dependencies | 15 runtime, 2 dev |

---

## File Structure

```
foreman/
├── src/
│   ├── engine.ts                # Core — wires all subsystems
│   ├── orchestrator.ts          # 4-layer pipeline (1200 LOC)
│   ├── cli.ts                   # Commander.js CLI (47 commands)
│   ├── repl.ts                  # Interactive REPL
│   ├── tools.ts                 # 49 tool definitions + executor
│   ├── prompts.ts               # Layer-specific system prompts
│   ├── worker-executor.ts       # Post-hoc extraction + execution
│   ├── reviewer-gate.ts         # Acımasız quality gate
│   │
│   ├── kimi-provider.ts         # Moonshot Kimi K2.5 (primary)
│   ├── antigravity-provider.ts  # Google Antigravity OAuth
│   ├── anthropic-provider.ts    # Claude direct
│   ├── openai-provider.ts       # GPT-4o direct
│   ├── gemini-provider.ts       # Gemini direct
│   ├── provider-bootstrap.ts    # Auto-register available providers
│   ├── provider.ts              # Provider registry interface
│   │
│   ├── execution-engine.ts      # Shell exec, file ops, securePath
│   ├── edit-engine.ts           # Surgical text edits
│   ├── git-engine.ts            # Git operations
│   ├── browser-engine.ts        # Puppeteer automation
│   ├── research-engine.ts       # Web research sub-agent
│   ├── web-search-engine.ts     # Brave Search API
│   ├── web-fetch-engine.ts      # URL fetch + readability
│   │
│   ├── thought-manager.ts       # Thought CRUD + indexing
│   ├── chain-manager.ts         # Chain lifecycle
│   ├── session-manager.ts       # Multi-session support
│   ├── memory-manager.ts        # Persistent memory (TF-IDF)
│   ├── cache-manager.ts         # Request caching
│   ├── state.ts                 # State persistence
│   │
│   ├── rate-limiter.ts          # RPM throttle + cooldown
│   ├── retry.ts                 # 404/429/5xx retry with fallback
│   ├── security-scanner.ts      # Secret detection, .gitignore audit
│   ├── approval-engine.ts       # Command risk scoring
│   ├── rollback-engine.ts       # Atomic rollback
│   ├── chain-repair.ts          # Orphan/stale chain healing
│   ├── cost-tracker.ts          # Per-request cost tracking
│   ├── cognitive-router.ts      # Load balancing across providers
│   │
│   ├── messaging-gateway.ts     # Telegram/WhatsApp gateway
│   ├── telegram-channel.ts      # Grammy-based Telegram bot
│   ├── whatsapp-channel.ts      # Baileys WhatsApp
│   ├── streaming-pipeline.ts    # Real-time event streaming
│   │
│   └── *.test.ts                # 38 test files, 807+ tests
│
├── bin/foreman                  # Entry point (bash → tsx)
├── package.json                 # ESM, Node 22+, tsx
├── tsconfig.json
├── VISION.md                    # Design philosophy
├── ARCHITECTURE.md              # System architecture
└── AGENTS.md                    # Agent guidelines
```

---

## Design Principles

1. **Atomicity** — every operation succeeds or fails completely. No partial state.
2. **Verification** — worker protocol requires STEP7 evidence. Reviewer gate validates.
3. **Resilience** — 3 retries per atom, chain repair, rollback, provider fallback.
4. **Extraction over tools** — default mode: 1 LLM call + post-hoc parse. Saves API calls.
5. **No mocks** — every tool does real work. `bash` runs real commands. `web_search` hits Brave API.

---

## Requirements

- Node.js 22+ (tested on 24.13.1)
- tsx (TypeScript execution)
- At least one API key: Kimi, Antigravity, OpenAI, Anthropic, or Gemini

---

## License

MIT

---

<div align="center">

**[github.com/SovranAMR/foreman](https://github.com/SovranAMR/foreman)**

</div>
