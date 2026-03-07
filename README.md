<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Tests-654_Passing-22C55E?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/LOC-57K-F5A623?style=flat-square" alt="LOC">
  <img src="https://img.shields.io/badge/License-Proprietary-EF4444?style=flat-square" alt="License">
</p>

<br>

```
    ███████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ██╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ██║
    █████╗  ██║   ██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ██║
    ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║
    ██║     ╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
```

<h3 align="center">The AI That Doesn't Just Write Code — It <em>Thinks</em> Before It Writes</h3>

<p align="center">
  <strong>4-layer cognitive pipeline · 52 tools · 22 engines · Built-in hallucination guard</strong>
</p>

---

## What Is Foreman?

Foreman is an **autonomous AI software engineer** that decomposes complex tasks through a 4-layer cognitive pipeline, executes them with real tools, verifies results against ground truth, and rolls back failures automatically.

It doesn't paste code and hope for the best. It **thinks in layers**, **verifies against reality**, and **catches its own hallucinations** before they reach your codebase.

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR TASK                               │
│              "Add dark mode with system preference sync"        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  🔮 VISIONER                                                     │
│  ─────────────────────────────────────────────────────────────── │
│  Defines the soul of the change. Not features — the FEELING.     │
│  Emotion target, focal point, color philosophy, forbidden list.  │
│  Budget: 5% of token window · Confidence threshold: 0.4+        │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  ⚒️  STRATEGIST                                                   │
│  ─────────────────────────────────────────────────────────────── │
│  Decomposes vision into execution blocks and atomic tasks.       │
│  Each block is a milestone. Each atom is one verifiable change.  │
│  Budget: 10% of token window · Confidence threshold: 0.3+       │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  🔍 RESEARCHER                                                   │
│  ─────────────────────────────────────────────────────────────── │
│  Gathers context. Reads files, greps code, searches the web.     │
│  Builds a knowledge base for the worker to act on.               │
│  Budget: 15% of token window · Confidence threshold: 0.2+       │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  🔨 WORKER                                                       │
│  ─────────────────────────────────────────────────────────────── │
│  Executes via 8-step protocol:                                   │
│  read → context → impact → decide → predict → execute → verify  │
│  → report                                                        │
│  Budget: 8K tokens/atom · Max 20 operations/atom                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  🔬 REVIEWER (Independent Tribunal)                         │ │
│  │  Different model reviews worker's output against vision.    │ │
│  │  Verdicts: PASS · REJECT · NEEDS_REVISION                  │ │
│  │  Worker can't grade its own homework.                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Why Foreman?

Most AI coding tools operate as **single-turn autocomplete** — you ask, they answer, you fix their mistakes.

Foreman operates as a **multi-turn autonomous engineer**:

| Traditional AI Coding | Foreman |
|:---|:---|
| Single LLM call → paste code | 4-layer pipeline → verified output |
| No verification | Build/test parsing with regression detection |
| Hallucinated imports, fake APIs | Ground truth engine + fact checker |
| Manual rollback | Automatic git-based rollback (atom/block/pipeline) |
| One model, pray it works | Multi-provider routing with instant failover |
| No cost awareness | Per-model, per-phase cost tracking with budget alerts |
| Context overflow = garbage | Layer-aware token budgets with progressive compression |

---

## Architecture

```
                    ┌──────────────────────────┐
                    │     Messaging Gateway     │
                    │   Telegram · WhatsApp     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │      Orchestrator         │
                    │   Pipeline Coordinator    │
                    └────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
   ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
   │   Engine     │       │  Cognitive   │       │  Pipeline    │
   │  30+ subsys  │       │   Router     │       │  Observer    │
   │  coordinated │       │ Multi-prov   │       │  Full trace  │
   └──────┬──────┘       │  load bal.   │       │  JSONL logs  │
          │               └─────────────┘       └─────────────┘
          │
    ┌─────┼─────┬─────────┬──────────┬──────────┬──────────┐
    │     │     │         │          │          │          │
    ▼     ▼     ▼         ▼          ▼          ▼          ▼
  Exec  Edit  Git     Rollback  Security  Halluc.    Cost
  Eng.  Eng.  Eng.    Engine    Scanner   Guard     Tracker
    │     │     │         │          │          │          │
    ▼     ▼     ▼         ▼          ▼          ▼          ▼
  Shell  File  Commit  Revert    Scan for   Ground    Track
  Cmds   Edits Diff    Changes   Secrets    Truth     $/token
         Range Branch  on Fail   Vulns      Facts
```

---

## The 22 Engines

Every engine is a standalone module with its own types, tests, and responsibility boundary.

```
 ENGINE                     │ WHAT IT DOES
════════════════════════════╪══════════════════════════════════════════════════
 ExecutionEngine            │ Shell commands with security filtering, timeouts,
                            │ background execution, process tracking
────────────────────────────┼──────────────────────────────────────────────────
 EditEngine                 │ Surgical text replacements with context-aware
                            │ matching, undo history, range edits
────────────────────────────┼──────────────────────────────────────────────────
 GitEngine                  │ Commits, branches, diffs, history, merge
                            │ conflict detection, stash management
────────────────────────────┼──────────────────────────────────────────────────
 VerificationEngine         │ Parse build/test output from ANY runner (Jest,
                            │ Vitest, node:test, Mocha, pytest). Extract errors
                            │ with file:line. Detect regressions across runs.
────────────────────────────┼──────────────────────────────────────────────────
 RollbackEngine             │ Git-based undo at atom, block, or pipeline level.
                            │ Stash guard saves WIP before rollback. Full
                            │ rollback history with preview before execution.
────────────────────────────┼──────────────────────────────────────────────────
 SecurityScanner            │ 5-capability project scanner: secret leak
                            │ detection (AWS, GitHub, Stripe, etc.), dependency
                            │ audit, .gitignore validation, hardcoded values,
                            │ file permission checks.
────────────────────────────┼──────────────────────────────────────────────────
 HallucinationGuard         │ Hook-based guardrails integrated with
                            │ GroundTruthEngine + FactChecker. Blocks
                            │ fabricated commands, files, and links BEFORE
                            │ they reach the codebase.
────────────────────────────┼──────────────────────────────────────────────────
 GroundTruthEngine          │ Extracts VERIFIED facts from the project:
                            │ package.json, entry points, available commands,
                            │ file structure. Zero guessing.
────────────────────────────┼──────────────────────────────────────────────────
 FactChecker                │ Validates LLM output against ground truth.
                            │ Catches hallucinated npm packages, fake CLI
                            │ commands, non-existent files. Strict mode
                            │ blocks on ANY violation.
────────────────────────────┼──────────────────────────────────────────────────
 CognitiveLoadBalancer      │ Multi-provider LLM router. When Provider A
                            │ hits rate limits (429), instantly routes to
                            │ Provider B. Zero downtime. RPM tracking per
                            │ endpoint with cooldown windows.
────────────────────────────┼──────────────────────────────────────────────────
 CostTracker                │ Per-model pricing (input/output/cache tokens),
                            │ phase-level cost breakdown, session-level
                            │ cumulative tracking, budget alerts.
────────────────────────────┼──────────────────────────────────────────────────
 PipelineObserver           │ Full pipeline observability: every phase, block,
                            │ atom tracked with timing. Every tool call logged.
                            │ JSONL files for post-mortem. Human-readable
                            │ summary generation.
────────────────────────────┼──────────────────────────────────────────────────
 ContextIntelligence        │ Layer-aware token budgets (Visioner 40%,
                            │ Worker 20%). Relevance-based thought retention.
                            │ 3-tier progressive summarization (full →
                            │ condensed → headline). Decision anchoring:
                            │ high-confidence thoughts never dropped.
────────────────────────────┼──────────────────────────────────────────────────
 ReviewerGate               │ Independent quality tribunal. DIFFERENT model
                            │ reviews the Worker's output against the Vision
                            │ document. Verdicts: PASS / REJECT /
                            │ NEEDS_REVISION. Breaks echo chamber bias.
────────────────────────────┼──────────────────────────────────────────────────
 BrowserEngine              │ Headless Chrome/Firefox via Playwright.
                            │ Navigate, screenshot, extract content, interact
                            │ with elements. Screenshot → base64 for LLM
                            │ vision analysis. PDF generation.
────────────────────────────┼──────────────────────────────────────────────────
 SubAgentEngine             │ Spawn isolated sub-agents with their own forge
                            │ pipelines. Parent-child linking, concurrent
                            │ execution, inter-agent messaging, shared memory,
                            │ result aggregation, timeout + auto-kill.
────────────────────────────┼──────────────────────────────────────────────────
 AgentRegistry (Mesh)       │ Central agent lifecycle: registration, state
                            │ transitions, heartbeat monitoring, health
                            │ scoring, event-driven coordination.
────────────────────────────┼──────────────────────────────────────────────────
 StreamingPipeline          │ Real-time pipeline output: phase/block/atom
                            │ events, tool call streaming, token-by-token LLM
                            │ output, cost updates, multiple output targets.
────────────────────────────┼──────────────────────────────────────────────────
 ApprovalEngine             │ Human-in-the-loop for destructive operations.
                            │ Gates dangerous shell commands, maintains audit
                            │ log of approved/denied operations.
────────────────────────────┼──────────────────────────────────────────────────
 CompactionEngine           │ Context window management. When thought chains
                            │ fill up: summarize via LLM, write to
                            │ chain.contextSummary, use summary instead of
                            │ full history.
────────────────────────────┼──────────────────────────────────────────────────
 BatchFileEngine            │ Atomic multi-file writes with rollback.
                            │ Write 10 files at once — if any fails, ALL
                            │ revert. Used by Worker for multi-file changes.
────────────────────────────┼──────────────────────────────────────────────────
 MediaEngine                │ Media file analysis: images, screenshots,
                            │ documents. Integrates with LLM vision models
                            │ for visual QA.
────────────────────────────┴──────────────────────────────────────────────────
```

---

## The 52 Tools

Every tool the LLM can invoke during execution. Each tool delegates to an engine for security and consistency.

```
 CATEGORY          │ TOOLS
═══════════════════╪═══════════════════════════════════════════════════════════
                   │
 🖥️  Shell          │ bash (async, timeout, background, yield_ms)
                   │ list_processes · poll_process · process_log
                   │ kill_process · kill_processes
                   │
 📁 Filesystem     │ read_file (line-range) · write_file · edit_file
                   │ edit_range · edit_undo · delete_file · list_dir
                   │ search_files · grep · search_in_files
                   │ batch_write (atomic multi-file) · batch_ops
                   │
 🔀 Git            │ git_status · git_commit · git_diff · git_log
                   │
 🔒 Security       │ security_scan
                   │
 ✅ Verification    │ verify_build · verify_tests
                   │
 🌐 Web            │ web_search (Brave API) · web_fetch
                   │ analyze_link · classify_url
                   │
 📝 Markdown       │ parse_markdown · extract_code
                   │
 📊 Analysis       │ diff_preview · semantic_search
                   │
 💾 Memory         │ memory_read · memory_write · memory_search
                   │
 ⏰ Scheduling     │ cron_list · cron_add · cron_remove
                   │
 🧑‍💻 Sessions       │ session_list · session_spawn · spawn_subagent
                   │
 🌍 Browser        │ browser_navigate · browser_screenshot
                   │ browser_extract · browser_pdf
                   │
 📦 Media          │ analyze_media · download_file
                   │
 📈 System         │ cache_stats · approval_audit
                   │
 🔥 Pipeline       │ forge_pipeline (recursive — pipeline within pipeline)
                   │
```

---

## Safety Systems

Foreman doesn't trust itself. Multiple independent systems prevent damage:

```
┌─────────────────────────────────────────────────────────┐
│                    SAFETY STACK                          │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 1: DANGEROUS COMMAND FILTER                 │  │
│  │ Blocks: rm -rf /, sudo, fork bombs, npm publish,  │  │
│  │ git push --force, reverse shells, disk wipes       │  │
│  │ 20+ regex patterns · Zero false negatives          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 2: APPROVAL ENGINE                          │  │
│  │ Human-in-the-loop for destructive operations.      │  │
│  │ Full audit trail of every approved/denied command.  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 3: HALLUCINATION GUARD                      │  │
│  │ Ground truth extraction → fact checking → block.   │  │
│  │ Catches fake packages, non-existent commands,      │  │
│  │ hallucinated file paths. Strict mode = zero        │  │
│  │ tolerance.                                         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 4: VERIFICATION ENGINE                      │  │
│  │ Parses real build/test output. Detects regressions │  │
│  │ by comparing against previous runs. Fails the atom │  │
│  │ if tests break.                                    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 5: REVIEWER GATE                            │  │
│  │ Independent LLM (different model) reviews output   │  │
│  │ against vision. Worker can't grade its own work.   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 6: ROLLBACK ENGINE                          │  │
│  │ If verification fails → automatic git revert.      │  │
│  │ Atom-level, block-level, or full pipeline revert.  │  │
│  │ Stash guard preserves WIP. Full rollback history.  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 7: SECURITY SCANNER                         │  │
│  │ Scans for leaked secrets (AWS, GitHub, Stripe),    │  │
│  │ vulnerable deps, missing .gitignore entries,       │  │
│  │ hardcoded values, bad file permissions.             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Context Intelligence

Most AI tools dump the entire chat history into the context window until it overflows. Foreman has a 5-tier system:

```
┌─────────────────────────────────────────────────────────────┐
│  CONTEXT INTELLIGENCE — 5-TIER SYSTEM                       │
│                                                             │
│  1. LAYER-AWARE BUDGETS                                     │
│     Visioner gets 40% (needs full picture)                  │
│     Strategist gets 25%                                     │
│     Researcher gets 15%                                     │
│     Worker gets 20% (tactical, focused)                     │
│                                                             │
│  2. RELEVANCE-BASED RETENTION                               │
│     Not FIFO. A thought about "TypeScript types" stays      │
│     when working on types, drops when working on CSS.       │
│     Similarity engine scores every thought.                 │
│                                                             │
│  3. PROGRESSIVE SUMMARIZATION (3 tiers)                     │
│     ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│     │   FULL     │  │ CONDENSED  │  │  HEADLINE  │         │
│     │  Recent    │→ │  Medium    │→ │   Old      │         │
│     │  Complete  │  │ Input+Out  │  │  One-line  │         │
│     └────────────┘  └────────────┘  └────────────┘         │
│                                                             │
│  4. DECISION ANCHORING                                      │
│     High-confidence decisions are PINNED — never dropped    │
│     regardless of age. They anchor the entire chain.        │
│                                                             │
│  5. CROSS-CHAIN CONTEXT                                     │
│     Worker chains get relevant parts from parent            │
│     strategist chains. Not everything — just what matters.  │
└─────────────────────────────────────────────────────────────┘
```

---

## Multi-Provider LLM Routing

```
                  Engine.callLLM()
                        │
                        ▼
              ┌─────────────────┐
              │   Cognitive      │
              │   Load Balancer  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │ Kimi    │   │ Gemini  │   │Anthropic│
    │ K2.5    │   │ 3.1 Pro │   │ Claude  │
    └────┬────┘   └────┬────┘   └────┬────┘
         │             │             │
         │  HTTP 429?  │             │
         │─────────────▶             │
         │             │  HTTP 429?  │
         │             │─────────────▶
         │             │             │
    Zero sleep. Zero downtime. Instant failover.
```

**Supported providers:** Kimi (Moonshot K2.5), Gemini (3.1 Pro), Anthropic (Claude), OpenAI (GPT-4o), Antigravity (Google)

**Per-layer model preferences:** Each pipeline layer can use a different default model with its own fallback chain.

---

## The Worker's 8-Step Protocol

Every atomic task follows this protocol — no exceptions:

```
  ┌─── STEP 1: READ ──────────────────────────────────────────┐
  │  Read the relevant files. Know what exists.                │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 2: CONTEXT ───────────────────────────────────────┐
  │  Understand HOW this fits into the larger codebase.        │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 3: IMPACT ────────────────────────────────────────┐
  │  What will break? What depends on what I'm changing?       │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 4: DECIDE ────────────────────────────────────────┐
  │  Choose the approach. State what I WILL and WON'T do.      │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 5: PREDICT ───────────────────────────────────────┐
  │  What should the output look like? Predict before doing.   │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 6: EXECUTE ───────────────────────────────────────┐
  │  Write code, run commands. Through ExecutionEngine only.   │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 7: VERIFY ────────────────────────────────────────┐
  │  Did it work? Run tests. Parse build output. Check diff.   │
  └────────────────────────────────────────────────────────────┘
                            │
  ┌─── STEP 8: REPORT ────────────────────────────────────────┐
  │  Summary of what changed, what was verified, confidence.   │
  └────────────────────────────────────────────────────────────┘
```

If any step is incomplete → retry. If retry fails → BLOCK signal propagates up.

---

## Pipeline Observability

Every forge run produces full observability:

```
.foreman/observer/
├── pipeline-2026-03-01T19-30-00.jsonl    # Every event, timestamped
├── pipeline-2026-03-01T19-30-00.md       # Human-readable summary
└── ...

Summary includes:
  ✦ Total phases, blocks, atoms executed
  ✦ Per-atom: duration, attempts, tool calls, operations, confidence
  ✦ Per-phase: token cost, elapsed time
  ✦ Total pipeline cost in USD
  ✦ Rejection feedback from Reviewer
  ✦ Rollback events (if any)
```

---

## CLI

```bash
# ─── User Commands ──────────────────────────────────────
foreman                     # Start (auto-activates Telegram if configured)
foreman setup               # Configure API keys (interactive)
foreman init <name>         # Create a new project
foreman status              # System health — memory, sessions, cache, providers
foreman run <task>          # Run a task through the full forge pipeline
foreman task add            # Add a task to the board
foreman task list           # List tasks
foreman task show <id>      # Task details
foreman task done <id>      # Mark task as done
foreman board               # Kanban board view
foreman doctor              # System health check
foreman serve               # Start Telegram/WhatsApp gateway

# ─── Internals (debug/inspect) ──────────────────────────
foreman internals thoughts  # List all thoughts
foreman internals chains    # List all chains
foreman internals history   # State transition history
foreman internals memory    # Memory entries
foreman internals sessions  # Active sessions
foreman internals cache     # Cache statistics
foreman internals providers # Provider status
```

---

## Messaging

Foreman runs as a Telegram bot or WhatsApp bot.

The LLM decides when to use the full forge pipeline vs. direct tool calls based on task complexity. Conversation history persisted to disk with 24h TTL.

```bash
# Start with environment variable
export FOREMAN_TELEGRAM_TOKEN="your_bot_token"
foreman                     # Auto-starts Telegram gateway

# Or via CLI
foreman serve --telegram <token> --allow <user_id>
```

**Security:** Sender allowlisting — only approved user IDs can interact.

---

## Project Stats

```
┌──────────────────────────────────────────┐
│          F O R E M A N   S T A T S       │
├──────────────────┬───────────────────────┤
│ Source files      │                   99 │
│ Test files        │                   53 │
│ Total LOC         │              ~57,000 │
│ Tests passing     │                  654 │
│ LLM tools         │                   52 │
│ CLI commands      │                   47 │
│ Engines           │                   22 │
│ LLM Providers     │                    5 │
│ Commits           │                 348+ │
│ Language          │  TypeScript (strict) │
│ Runtime           │        Node.js 22+  │
│ Test framework    │  node:test + assert  │
├──────────────────┴───────────────────────┤
│  Built with ⚒️  by @SovranAMR            │
└──────────────────────────────────────────┘
```

---

## Development

```bash
npm install
npm test                      # Run all 654 tests
npx tsx src/cli.ts status     # Check engine status
npx tsx src/cli.ts doctor     # Full system health check
```

---

## The Forge Pipeline — Deep Dive

This is the heart of Foreman. Not a wrapper around an LLM — a **cognitive execution engine** with 2,830 lines of orchestration logic that turns a single task into verified, committed code.

```
                         ┌───────────────────┐
                         │    "Add OAuth2     │
                         │   to the API"      │
                         └─────────┬─────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐        ┌──────────────┐         ┌──────────────┐
   │ Hallucination│        │   Ground     │         │   Rollback   │
   │ Guard Init   │        │   Truth      │         │  Checkpoint  │
   │ (strict mode)│        │  Extraction  │         │  (pipeline)  │
   └──────┬──────┘        └──────┬───────┘         └──────┬───────┘
          │                      │                        │
          └──────────────────────┼────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  🔮 PHASE 1: VISION     │
                    │  Budget: 5% of tokens   │
                    │  Confidence min: 0.4     │
                    ├─────────────────────────┤
                    │  + Project context       │
                    │  + Identity context      │
                    │  + Memory recall         │
                    │                          │
                    │  ┌────────────────────┐  │
                    │  │ HUMAN CHECKPOINT   │  │
                    │  │ (interactive mode)  │  │
                    │  │ Approve / Revise /  │  │
                    │  │ Abort the vision    │  │
                    │  └────────────────────┘  │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  ⚒️ PHASE 2: DECOMPOSE  │
                    │  Budget: 5% of tokens   │
                    ├─────────────────────────┤
                    │  Sizing rules enforced:  │
                    │  1 file → 1-2 blocks     │
                    │  2-5 files → 2-3 blocks  │
                    │  5-15 files → 3-5 blocks │
                    │  Hard cap: 8 blocks max  │
                    │                          │
                    │  Dependency graph built   │
                    │  → topological sort       │
                    │  → execution waves        │
                    └────────────┬─────────────┘
                                 │
         ┌───────────────────────┼──── FOR EACH BLOCK ────┐
         │                       │        (wave-ordered)   │
         │              ┌────────▼────────┐               │
         │              │ 🔍 RESEARCH      │               │
         │              │ Budget: 15%      │               │
         │              ├──────────────────┤               │
         │              │ • Hot memories   │               │
         │              │ • Warm memories  │               │
         │              │ • Semantic recall│               │
         │              │ • Embedding srch │               │
         │              │ • Cross-chain ctx│               │
         │              │ • Web search     │               │
         │              └────────┬────────┘               │
         │                       │                         │
         │              ┌────────▼────────┐               │
         │              │ ⚛️ ATOMIZE       │               │
         │              │ (per block)      │               │
         │              ├──────────────────┤               │
         │              │ 1 file → 1-2     │               │
         │              │ 2-5 files → 2-4  │               │
         │              │ Hard cap: 6/block│               │
         │              └────────┬────────┘               │
         │                       │                         │
         │     ┌─────────────────┼──── FOR EACH ATOM ──┐  │
         │     │                 │    (max 3 retries)   │  │
         │     │        ┌────────▼────────┐            │  │
         │     │        │ 🔨 EXECUTE       │            │  │
         │     │        │ Budget: 65%      │            │  │
         │     │        │ 8K tokens/atom   │            │  │
         │     │        │ 20 ops max/atom  │            │  │
         │     │        ├──────────────────┤            │  │
         │     │        │                  │            │  │
         │     │        │ TWO MODES:       │            │  │
         │     │        │                  │            │  │
         │     │        │ A) Tool Mode     │            │  │
         │     │        │    LLM calls 52  │            │  │
         │     │        │    tools live    │            │  │
         │     │        │    (real-time)    │            │  │
         │     │        │                  │            │  │
         │     │        │ B) Extraction    │            │  │
         │     │        │    1 LLM call →  │            │  │
         │     │        │    post-hoc parse │            │  │
         │     │        │    + execute      │            │  │
         │     │        │                  │            │  │
         │     │        │ Pre-reads files  │            │  │
         │     │        │ from atom desc   │            │  │
         │     │        │ (zero halluc.)   │            │  │
         │     │        └────────┬────────┘            │  │
         │     │                 │                      │  │
         │     │        ┌────────▼────────┐            │  │
         │     │        │ 🔬 VERIFY        │            │  │
         │     │        ├──────────────────┤            │  │
         │     │        │ Build output     │            │  │
         │     │        │ parsing (Jest,   │            │  │
         │     │        │ Vitest, pytest)  │            │  │
         │     │        │ Regression check │            │  │
         │     │        │ Code fence scan  │            │  │
         │     │        │ Pattern analysis │            │  │
         │     │        └────────┬────────┘            │  │
         │     │                 │                      │  │
         │     │        ┌────────▼────────┐            │  │
         │     │        │ ⚖️ REVIEWER GATE │            │  │
         │     │        ├──────────────────┤            │  │
         │     │        │ Phase 1: Quick   │            │  │
         │     │        │ local check (no  │            │  │
         │     │        │ LLM cost)        │            │  │
         │     │        │                  │            │  │
         │     │        │ Phase 2: Full    │            │  │
         │     │        │ LLM review       │            │  │
         │     │        │ (DIFFERENT model) │            │  │
         │     │        │                  │            │  │
         │     │        │ PASS → commit    │            │  │
         │     │        │ REJECT → rollback│            │  │
         │     │        │  + retry w/      │            │  │
         │     │        │  feedback        │            │  │
         │     │        └────────┬────────┘            │  │
         │     │                 │                      │  │
         │     │        ┌────────▼────────┐            │  │
         │     │        │ ✅ AUTO-COMMIT   │            │  │
         │     │        │ Git commit with  │            │  │
         │     │        │ chain/thought    │            │  │
         │     │        │ metadata         │            │  │
         │     │        └─────────────────┘            │  │
         │     │                                       │  │
         │     │  ┌──────────────────────────────────┐ │  │
         │     │  │ ON FAILURE:                      │ │  │
         │     │  │ • Git rollback to last atom      │ │  │
         │     │  │ • Inject rejection feedback      │ │  │
         │     │  │ • Retry (max 3 attempts)         │ │  │
         │     │  │ • 50%+ atoms fail → abandon block│ │  │
         │     │  └──────────────────────────────────┘ │  │
         │     └───────────────────────────────────────┘  │
         │                                                │
         │  ┌──────────────────────────────────────────┐  │
         │  │ 🪞 REFLECTION (every 5 atoms)             │  │
         │  │ Vision drift check — are we still         │  │
         │  │ building what we said we would?            │  │
         │  └──────────────────────────────────────────┘  │
         └────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  📊 PIPELINE COMPLETE     │
                    │                           │
                    │  • Observer summary (MD)   │
                    │  • JSONL event log         │
                    │  • Cost report             │
                    │  • Memory persistence      │
                    │  • Session close           │
                    │  • Git stash restore       │
                    │  • Forge bridge notify     │
                    └───────────────────────────┘
```

### What Happens Under the Hood

Every forge run triggers **17 coordinated subsystems** before a single line of code is written:

```
 STEP │ SUBSYSTEM               │ WHAT HAPPENS
══════╪═════════════════════════╪════════════════════════════════════════
  1   │ HallucinationGuard      │ Scans project, builds ground truth map
  2   │ HooksEngine             │ Fires before_pipeline — can BLOCK
  3   │ RollbackEngine          │ Creates pipeline-level git checkpoint
  4   │ SessionManager          │ Auto-starts session (user never deals with this)
  5   │ MultiSessionManager     │ Creates named forge session for context
  6   │ SessionLifecycle        │ Registers session with slug identifier
  7   │ IdentityEngine          │ Loads identity context from memory
  8   │ PipelineResumeEngine    │ Clears stale checkpoints from crashed runs
  9   │ StateManager            │ Resets activeChainId, transitions to idle
 10   │ MemoryManager           │ Cleans up expired/cold memories
 11   │ CacheManager            │ Purges expired cache entries
 12   │ GitEngine               │ Stash guard — saves uncommitted work
 13   │ GitEngine               │ Creates isolated task branch
 14   │ StreamingPipeline       │ Announces pipeline start to all targets
 15   │ ForgeBridge             │ Notifies gateway about pipeline start
 16   │ PipelineObserver        │ Starts JSONL event logging
 17   │ CostTracker             │ Initializes per-phase cost tracking
```

### Token Budget Enforcement

The pipeline doesn't let any phase eat the budget. Hard limits enforced at runtime:

```
 PHASE        │ BUDGET  │ PURPOSE
══════════════╪═════════╪═══════════════════════════════════════
 Vision       │   5%    │ Define the soul — must be concise
 Decompose    │   5%    │ Structural, not verbose
 Research     │  15%    │ Heavy but bounded context gathering
 Execute      │  65%    │ Bulk of tokens for actual work
 Reflect      │   5%    │ Periodic vision drift checks
 Review       │   5%    │ Independent tribunal calls
══════════════╪═════════╪═══════════════════════════════════════
 Session max  │   2M    │ Hard ceiling — pipeline stops if hit
 Per atom     │   8K    │ Forces focused, atomic changes
 Per block    │  40K    │ Prevents block sprawl
```

### The Retry-Rollback-Feedback Loop

When an atom fails, Foreman doesn't just retry blindly. It **rolls back, explains why it failed, and retries with that context**:

```
  Atom Attempt 1
       │
       ▼
  Worker writes code ──→ Reviewer REJECTS
       │                 "Vision says no external deps,
       │                  you imported lodash"
       │
       ▼
  ⏪ Git rollback to pre-atom state
       │
       ▼
  Atom Attempt 2
  (injected context):
  "⚠️ PREVIOUS ATTEMPT REJECTED:
   Vision says no external deps,
   you imported lodash.
   Fix this. Do NOT repeat."
       │
       ▼
  Worker writes code ──→ Reviewer PASSES ✅
       │
       ▼
  Auto-commit with metadata
```

After 3 failed attempts → atom is skipped. If 50%+ atoms in a block fail → entire block is abandoned.

### Two Execution Modes

```
 MODE A: TOOL MODE (FOREMAN_TOOL_MODE=1)
 ═══════════════════════════════════════════
 LLM calls tools in real-time. Multiple API round-trips per atom.
 More powerful — LLM can read a file, decide, write, verify, iterate.
 Higher cost, rate-limit sensitive.

   LLM ──call──→ read_file("src/auth.ts")
   LLM ←─result── (file contents)
   LLM ──call──→ edit_file("src/auth.ts", ...)
   LLM ←─result── (success)
   LLM ──call──→ bash("npm test")
   LLM ←─result── (12 passing)
   LLM ──call──→ git_commit("add OAuth2 middleware")
   LLM ←─result── (abc1234)

 MODE B: EXTRACTION MODE (default)
 ═══════════════════════════════════════════
 Single LLM call. Foreman parses the response post-hoc,
 extracts file writes and shell commands, executes them
 through ExecutionEngine.

   LLM ──single call──→ (full 8-step protocol response)
         │
         ▼
   WorkerExecutor.extractOperations()
   ├── write_file: src/auth.ts (detected)
   ├── edit_file: src/server.ts (detected)
   └── bash: npm test (detected)
         │
         ▼
   ExecutionEngine runs each operation
   SecurityScanner blocks dangerous commands
   ApprovalEngine gates destructive ops
```

### Pre-Execution File Analysis

Before the Worker touches anything, Foreman **pre-reads the files** mentioned in the atom description:

```
  Atom: "Add rate limiting to src/middleware/auth.ts"
                    │
                    ▼
  Regex extracts: ["src/middleware/auth.ts"]
                    │
                    ▼
  Reads actual file contents (max 3 files, 50 lines preview)
                    │
                    ▼
  Injects into Worker context:
  "PRE-READ FILES (real contents — do NOT hallucinate):
   [FILE: src/middleware/auth.ts] (127 lines)
   import { verify } from 'jsonwebtoken';
   ..."
```

The Worker sees **real code**, not imagined code. This is why Foreman's edits actually work.

### Research Phase Intelligence

Each block gets 6 layers of context before execution:

```
 SOURCE                │ HOW IT WORKS
═══════════════════════╪════════════════════════════════════════
 Hot Memories          │ Recent, frequently accessed — FIFO top 3
 Warm Memories         │ Tag-matched to block keywords
 Semantic Recall       │ Similarity engine scores past thoughts
 Embedding Search      │ Vector search over project codebase
 Cross-Chain Context   │ Relevant insights from parallel chains
 Web Search            │ Brave API — best practices for the task
```

### Dependency-Aware Block Ordering

Blocks aren't executed linearly. The Strategist produces a dependency graph, and Foreman computes **execution waves**:

```
  Block 1: Database schema        ─┐
  Block 2: API routes             ─┤──→ Wave 0 (parallel-safe)
  Block 3: Auth middleware        ─┘
  Block 4: API integration tests  ──→ Wave 1 (depends on 1,2,3)
  Block 5: Frontend components    ──→ Wave 1 (depends on 2)
  Block 6: E2E tests              ──→ Wave 2 (depends on 4,5)

  Execution: W0:[1,2,3] → W1:[4,5] → W2:[6]
```

Within each wave, blocks run sequentially (shared filesystem safety). Future: parallel execution within waves.

---

## How It Thinks — A Real Example

**Task:** "Add a rate limiting middleware to the Express API"

```
Phase 1 — 🔮 Vision (5% budget)
  "Rate limiting protects the API from abuse. Must be transparent
   (X-RateLimit headers), configurable per-route, and fail gracefully
   with 429 responses. No external dependencies if possible."

Phase 2 — ⚒️ Strategy (10% budget)
  Block 1: Create rate limiter module (sliding window algorithm)
    Atom 1.1: Implement token bucket with configurable limits
    Atom 1.2: Add per-route configuration support
  Block 2: Integrate middleware
    Atom 2.1: Wire into Express app with default limits
    Atom 2.2: Add X-RateLimit-* response headers
  Block 3: Verify
    Atom 3.1: Write tests for edge cases (burst, reset, per-IP)
    Atom 3.2: Run existing tests — verify zero regressions

Phase 3 — 🔍 Research (15% budget)
  Read: src/server.ts, src/middleware/, package.json
  Grep: "rate" "limit" "throttle" across codebase
  Web: IETF rate limiting headers spec (RFC 6585)

Phase 4 — 🔨 Worker (per atom, 8-step protocol)
  For each atom:
    read → context → impact → decide → predict → execute → verify → report
  
  After each atom:
    → VerificationEngine parses test output
    → ReviewerGate (different model) checks against Vision
    → If REJECT → retry with feedback
    → If tests fail → RollbackEngine reverts to last checkpoint

Result: Rate limiter added, 12 tests passing, 0 regressions, $0.03 cost
```

---

## File Structure

```
foreman/
├── src/
│   ├── orchestrator.ts              # 4-layer pipeline coordinator
│   ├── engine.ts                    # Core engine — 30+ subsystems
│   ├── tools.ts                     # 52 LLM tool definitions
│   ├── types.ts                     # Core type system
│   ├── prompts.ts                   # Layer-specific system prompts
│   ├── parser.ts                    # Structured output parser
│   ├── validators.ts                # Confidence + protocol validation
│   │
│   ├── # ─── Execution ───────────────────────────────
│   ├── execution-engine.ts          # Shell commands + process mgmt
│   ├── worker-executor.ts           # 8-step protocol bridge
│   ├── edit-engine.ts               # Surgical text edits
│   ├── batch-file-engine.ts         # Atomic multi-file writes
│   ├── git-engine.ts                # Git operations
│   ├── diff-engine.ts               # Diff generation + summary
│   │
│   ├── # ─── Intelligence ────────────────────────────
│   ├── cognitive-router.ts          # Multi-provider load balancer
│   ├── context-intelligence.ts      # 5-tier context management
│   ├── context-compression.ts       # Progressive summarization
│   ├── context-guard.ts             # Context window enforcement
│   ├── compaction-engine.ts         # LLM-based thought compression
│   ├── similarity-engine.ts         # Text similarity scoring
│   ├── embedding-engine.ts          # Embedding-based search
│   │
│   ├── # ─── Safety ──────────────────────────────────
│   ├── hallucination-guard.ts       # Pipeline-integrated guard
│   ├── ground-truth-engine.ts       # Codebase fact extraction
│   ├── fact-checker.ts              # LLM output validation
│   ├── ground-truth-validator.ts    # Worker output validation
│   ├── security-scanner.ts          # Project security scan
│   ├── verification-engine.ts       # Build/test/server parsing
│   ├── reviewer-gate.ts             # Independent review tribunal
│   ├── rollback-engine.ts           # Git-based undo system
│   ├── approval-engine.ts           # Human-in-the-loop gate
│   │
│   ├── # ─── Observability ───────────────────────────
│   ├── pipeline-observer.ts         # Full pipeline tracing
│   ├── streaming-pipeline.ts        # Real-time event streaming
│   ├── cost-tracker.ts              # Per-model cost tracking
│   │
│   ├── # ─── LLM Providers ──────────────────────────
│   ├── provider.ts                  # Provider interface + registry
│   ├── kimi-provider.ts             # Moonshot Kimi K2.5
│   ├── gemini-provider.ts           # Google Gemini
│   ├── anthropic-provider.ts        # Anthropic Claude
│   ├── openai-provider.ts           # OpenAI GPT-4o
│   ├── antigravity-provider.ts      # Google Antigravity
│   ├── model-fallback.ts            # Error classification + fallback
│   ├── model-discovery.ts           # Available model detection
│   ├── retry.ts                     # Retry with backoff
│   │
│   ├── # ─── Multi-Agent ─────────────────────────────
│   ├── subagent-engine.ts           # Sub-agent lifecycle
│   ├── agent-mesh/                  # Agent registry + health
│   │   ├── agent-registry.ts
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── # ─── Messaging ───────────────────────────────
│   ├── messaging-gateway.ts         # Central message hub
│   ├── telegram-channel.ts          # Telegram bot
│   ├── whatsapp-channel.ts          # WhatsApp (Baileys)
│   ├── channel.ts                   # Channel interface
│   │
│   ├── # ─── Web & Research ──────────────────────────
│   ├── browser-engine.ts            # Headless Playwright
│   ├── web-search-engine.ts         # Brave Search API
│   ├── web-fetch-engine.ts          # URL content extraction
│   ├── research-engine.ts           # Research coordination
│   ├── link-intelligence.ts         # URL classification
│   │
│   ├── # ─── State & Memory ─────────────────────────
│   ├── state.ts                     # State persistence
│   ├── memory-manager.ts            # Memory CRUD
│   ├── memory-md-bridge.ts          # Memory.md sync
│   ├── session-manager.ts           # Session persistence
│   ├── multi-session.ts             # Multi-chat sessions
│   ├── session-lifecycle.ts         # Session lifecycle hooks
│   ├── cache-manager.ts             # Response cache
│   ├── thought-manager.ts           # Thought persistence
│   ├── chain-manager.ts             # Chain persistence
│   ├── chain-repair.ts              # Chain health checks
│   │
│   ├── # ─── Infrastructure ──────────────────────────
│   ├── cli.ts                       # 47 CLI commands
│   ├── config.ts                    # ~/.foreman configuration
│   ├── theme.ts                     # Forge visual theme
│   ├── animations.ts                # CLI animations
│   ├── rate-limiter.ts              # Request rate limiting
│   ├── process-registry.ts          # Background process tracking
│   ├── command-queue.ts             # Sequential command queue
│   ├── task-manager.ts              # Task board
│   ├── task-scheduler.ts            # Scheduled tasks
│   ├── cron-engine.ts               # Cron job management
│   ├── project-detector.ts          # Project type detection
│   ├── identity-engine.ts           # Agent identity
│   ├── hooks-engine.ts              # Pipeline hooks
│   ├── onboarding.ts                # First-run setup
│   ├── errors.ts                    # Error types + helpers
│   ├── markdown-intelligence.ts     # Markdown parsing
│   ├── transcript-repair.ts         # Broken transcript repair
│   ├── forge-gateway.ts             # Forge bridge
│   ├── media-engine.ts              # Media analysis
│   ├── message-actions.ts           # Message action handlers
│   ├── interactive-confirm.ts       # Interactive prompts
│   ├── pipeline-resume.ts           # Checkpoint/resume
│   └── file-watcher.ts              # File change detection
│
├── bin/
│   └── foreman                      # CLI entry point
│
├── foreman-showcase/
│   └── index.html                   # Product showcase page
│
├── package.json
└── tsconfig.json
```

---

<p align="center">
  <strong>Built with ⚒️ by <a href="https://github.com/SovranAMR">@SovranAMR</a></strong>
</p>

<p align="center">
  <em>"It doesn't just write code. It thinks, verifies, and takes responsibility."</em>
</p>
