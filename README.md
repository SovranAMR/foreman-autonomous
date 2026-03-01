<p align="center">
  <br />
  <br />
</p>

<h1 align="center">
<pre>
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ███████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ║
║   ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ║
║   █████╗  ██║   ██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ║
║   ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██║║
║   ██║     ╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ║██║
║   ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝ ╚═╝
║                                                               ║
║           THE   AUTONOMOUS   CODING   AGENT                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
</pre>
</h1>

<p align="center">
  <strong>Multi-agent thought-chain orchestrator that doesn't just plan — it builds.</strong>
  <br />
  <em>4-layer cognitive pipeline · 52 LLM tools · 22 engines · Zero hallucination architecture</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-ESM_Strict-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=nodedotjs" alt="Node.js" />
  <img src="https://img.shields.io/badge/Tests-654_passing-22C55E?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/LOC-57K-F5A623?style=flat-square" alt="Lines of Code" />
  <img src="https://img.shields.io/badge/Engines-22-A855F7?style=flat-square" alt="Engines" />
  <img src="https://img.shields.io/badge/License-Private-EF4444?style=flat-square" alt="License" />
</p>

---

## What is Foreman?

Most AI coding tools are glorified autocomplete. You type, they guess. You prompt, they hallucinate. You hope for the best.

**Foreman doesn't guess. Foreman thinks.**

It takes a task — "add dark mode to the React app" — and runs it through a 4-layer cognitive pipeline where each layer has a different job, a different perspective, and real tools to verify its own work. When it writes code, it runs the build. When the build fails, it reads the errors, fixes them, and tries again. When it's done, a separate AI model reviews the output against the original vision. If it doesn't pass, it goes back.

No copy-paste. No "here's what you should do." It does it.

---

## Architecture

```
                          ┌─────────────────────┐
                          │     USER  TASK       │
                          │  "Add dark mode..."  │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │         🔮  VISIONER             │
                    │                                  │
                    │  Defines the soul of the task.   │
                    │  Emotion target, focal point,    │
                    │  color philosophy, constraints.  │
                    │  Scales depth to complexity:     │
                    │  simple → 2 lines                │
                    │  complex → full creative brief   │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │       ⚒️   STRATEGIST            │
                    │                                  │
                    │  Decomposes vision into blocks   │
                    │  and atoms. Each atom is a       │
                    │  single, verifiable unit of      │
                    │  work. Sends BLOCK signal up     │
                    │  if vision is inconsistent.      │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │        🔍  RESEARCHER            │
                    │                                  │
                    │  Gathers context. Reads files,   │
                    │  greps codebase, searches web,   │
                    │  fetches docs. Builds the        │
                    │  knowledge base the Worker       │
                    │  needs to execute.               │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │         🔨  WORKER               │
                    │                                  │
                    │  Executes via 8-step protocol:   │
                    │  read → context → impact →       │
                    │  decide → predict → execute →    │
                    │  verify → report                 │
                    │                                  │
                    │  Real tools. Real file writes.   │
                    │  Real shell commands.            │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │        🔬  REVIEWER              │
                    │                                  │
                    │  Independent quality tribunal.   │
                    │  Uses a DIFFERENT LLM model to   │
                    │  avoid echo chamber bias.        │
                    │  Verdicts: PASS / REJECT /       │
                    │  NEEDS_REVISION                  │
                    └────────────────┬────────────────┘
                                     │
                               ┌─────▼─────┐
                               │  ✅ DONE   │
                               └───────────┘
```

### Why 4 Layers?

Single-shot LLM calls fail at complex tasks because they try to understand, plan, research, and execute simultaneously. Foreman separates concerns:

| Layer | Thinks About | Token Budget | Confidence Threshold |
|-------|-------------|-------------|---------------------|
| **Visioner** | *Why* does this exist? | 5% of session | warn: 0.6 / block: 0.4 |
| **Strategist** | *How* to organize the work? | 10% of session | warn: 0.5 / block: 0.3 |
| **Researcher** | *What* context is needed? | 15% of session | warn: 0.4 / block: 0.2 |
| **Worker** | *What* to do right now? | 70% of session | warn: 0.6 / block: 0.35 |

Each layer can send a **BLOCK signal** up the chain if something doesn't make sense. Vision is inconsistent? Block. Strategy can't decompose? Block. Research finds contradictions? Block. This prevents the system from confidently building the wrong thing.

---

## The 52 Tools

Foreman's Worker doesn't just generate text — it has 52 real tools for interacting with the filesystem, shell, git, web, and browser:

### 🔧 Filesystem & Code

| Tool | Description |
|------|-------------|
| `bash` | Shell execution with timeout, background mode, session polling |
| `read_file` | Read files with line-range support |
| `write_file` | Create or overwrite files |
| `edit_file` | Surgical text replacement via EditEngine |
| `edit_range` | Edit specific line ranges |
| `edit_undo` | Undo last edit operation |
| `batch_write` | Atomic multi-file writes with rollback |
| `batch_ops` | Batch file operations (create, delete, rename) |
| `delete_file` | Safe file deletion |
| `search_files` | Find files by name/glob pattern |
| `grep` | Content search with regex support |
| `search_in_files` | Advanced multi-file content search |
| `list_dir` | Directory listing with metadata |
| `diff_preview` | Preview changes before applying |

### 🔀 Git

| Tool | Description |
|------|-------------|
| `git_status` | Repository status via GitEngine |
| `git_commit` | Commit changes with message |
| `git_diff` | View diffs (staged, unstaged, between refs) |
| `git_log` | Commit history with filtering |

### 🔬 Verification & Security

| Tool | Description |
|------|-------------|
| `verify_build` | Parse build output — extract errors with file:line, classify error types (syntax, type, import, runtime), suggest fixes |
| `verify_tests` | Parse test output from any runner (Jest, Vitest, node:test, Mocha, pytest) — extract pass/fail/skip, detect regressions |
| `security_scan` | Project-level security scan — secret leak detection, dependency audit, .gitignore validation, hardcoded value detection |
| `approval_audit` | Review pending dangerous command approvals |

### 🌐 Web & Research

| Tool | Description |
|------|-------------|
| `web_search` | Brave Search API integration |
| `web_fetch` | Fetch and extract readable content from URLs |
| `analyze_link` | Classify and fetch URL metadata |
| `classify_url` | URL type classification |
| `download_file` | Download files from URLs |

### 🖥️ Browser

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URLs in headless Chrome |
| `browser_screenshot` | Full-page or element screenshots → base64 for LLM vision |
| `browser_extract` | Extract page content (text, HTML, accessibility tree) |
| `browser_pdf` | Generate PDFs from web pages |

### 📝 Intelligence

| Tool | Description |
|------|-------------|
| `parse_markdown` | Extract code fences, tables, sections, lists, frontmatter |
| `extract_code` | Extract code blocks from markdown |
| `semantic_search` | Embedding-based semantic code search |

### 🧠 Memory & Sessions

| Tool | Description |
|------|-------------|
| `memory_read` | Read persistent memory entries |
| `memory_write` | Write to persistent memory |
| `memory_search` | Search memory by content |
| `session_list` | List active sessions |
| `session_spawn` | Spawn isolated sub-agent sessions |
| `spawn_subagent` | Spawn forge-pipeline sub-agents with team coordination |

### ⚙️ Process & System

| Tool | Description |
|------|-------------|
| `list_processes` | List background processes |
| `poll_process` | Check process status |
| `process_log` | Read process output logs |
| `kill_process` | Terminate a process |
| `kill_processes` | Bulk process termination |
| `analyze_media` | Media file analysis |
| `cache_stats` | View cache statistics |

### ⏰ Scheduling

| Tool | Description |
|------|-------------|
| `cron_list` | List scheduled jobs |
| `cron_add` | Add cron jobs |
| `cron_remove` | Remove cron jobs |

### 🔥 Pipeline

| Tool | Description |
|------|-------------|
| `forge_pipeline` | Trigger a full forge pipeline from within a pipeline (recursive orchestration) |

---

## The 22 Engines

Every capability is a dedicated engine — modular, testable, replaceable:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FOREMAN ENGINE MAP                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ ExecutionEngine  │  │   EditEngine     │  │  BatchFileEngine │     │
│  │                  │  │                  │  │                  │     │
│  │ Shell commands,  │  │ Surgical text    │  │ Atomic multi-    │     │
│  │ process mgmt,   │  │ replacements,    │  │ file writes      │     │
│  │ security checks  │  │ range edits,     │  │ with rollback    │     │
│  │                  │  │ undo history     │  │                  │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │   GitEngine      │  │VerificationEng  │  │ SecurityScanner  │     │
│  │                  │  │                  │  │                  │     │
│  │ Commits, diffs,  │  │ Build output     │  │ Secret leaks,    │     │
│  │ branches,        │  │ parsing, test    │  │ dependency       │     │
│  │ history          │  │ results,         │  │ audit,           │     │
│  │                  │  │ regression       │  │ .gitignore,      │     │
│  │                  │  │ detection        │  │ hardcoded values │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ RollbackEngine   │  │ ApprovalEngine   │  │HallucinationGrd │     │
│  │                  │  │                  │  │                  │     │
│  │ Git-based undo   │  │ Human-in-the-    │  │ Ground truth     │     │
│  │ at atom, block,  │  │ loop gates for   │  │ analysis →       │     │
│  │ or pipeline      │  │ destructive      │  │ fact checking →  │     │
│  │ level. Stash     │  │ operations.      │  │ violation        │     │
│  │ guard included.  │  │ Audit trail.     │  │ blocking.        │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  CostTracker     │  │PipelineObserver  │  │CognitiveRouter   │     │
│  │                  │  │                  │  │                  │     │
│  │ Per-model, per-  │  │ Full pipeline    │  │ Multi-provider   │     │
│  │ phase cost       │  │ observability.   │  │ load balancing.  │     │
│  │ tracking with    │  │ JSONL logs +     │  │ Zero-downtime    │     │
│  │ budget alerts.   │  │ markdown         │  │ failover on 429. │     │
│  │                  │  │ summaries.       │  │ Round-robin.     │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  BrowserEngine   │  │ SubAgentEngine   │  │ StreamingPipe    │     │
│  │                  │  │                  │  │                  │     │
│  │ Headless Chrome  │  │ Spawn parallel   │  │ Real-time phase/ │     │
│  │ control.         │  │ forge pipelines. │  │ block/atom       │     │
│  │ Navigate,        │  │ Parent-child     │  │ progress.        │     │
│  │ screenshot,      │  │ linking, shared  │  │ Token-by-token   │     │
│  │ extract, PDF.    │  │ memory, result   │  │ LLM output.      │     │
│  │ Vision→LLM.     │  │ aggregation.     │  │ Multi-target.    │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ ContextIntel     │  │  EmbeddingEng    │  │ IdentityEngine   │     │
│  │                  │  │                  │  │                  │     │
│  │ Layer-aware      │  │ Vector-based     │  │ Project & user   │     │
│  │ context budgets. │  │ semantic search  │  │ identity         │     │
│  │ Relevance-based  │  │ across codebase. │  │ management.      │     │
│  │ retention, not   │  │                  │  │                  │     │
│  │ FIFO. Decision   │  │                  │  │                  │     │
│  │ anchoring.       │  │                  │  │                  │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐                                                 │
│  │  MediaEngine     │                                                 │
│  │                  │                                                 │
│  │ Media file       │                                                 │
│  │ analysis and     │                                                 │
│  │ processing.      │                                                 │
│  └─────────────────┘                                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Zero Hallucination Architecture

Foreman has a 3-layer anti-hallucination system that no other coding agent implements:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Layer 1: GROUND TRUTH ENGINE                            │
│  ─────────────────────────────                           │
│  Before the pipeline even starts, scans the project:     │
│  • package.json → verified commands, entry points        │
│  • File tree → actual structure (not assumed)             │
│  • Dependencies → real versions (not guessed)             │
│  • Binary existence → verified, not hallucinated          │
│  Injects verified facts into every prompt.                │
│                                                          │
│  Layer 2: FACT CHECKER                                    │
│  ────────────────────                                    │
│  Every LLM output is validated against ground truth:      │
│  • Does that command actually exist?                      │
│  • Does that file path resolve?                           │
│  • Is that metric real or fabricated?                     │
│  • Is that URL a placeholder or real?                     │
│  Violations → blocked in strict mode.                    │
│                                                          │
│  Layer 3: HALLUCINATION GUARD                             │
│  ────────────────────────────                            │
│  Hook-based guardrails at every pipeline stage:           │
│  • before_pipeline: inject ground truth context           │
│  • after_vision: validate vision against project reality  │
│  • after_worker: validate code changes against facts      │
│  • before_commit: final fact check before any git commit  │
│  Violation count tracked. Strict mode = zero tolerance.   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Context Intelligence

Foreman doesn't do dumb FIFO context window management. It uses **5 strategies** that understand what matters:

### 1. Layer-Aware Budgets
Each cognitive layer gets a different share of the context window:
- **Visioner**: 40% (needs the full picture)
- **Strategist**: 25% (needs structure)
- **Researcher**: 15% (needs facts)
- **Worker**: 20% (tactical, focused)

### 2. Relevance-Based Retention
Not first-in-first-out. A thought about "TypeScript types" stays in context when working on types, even if it's old. Uses the SimilarityEngine for scoring.

### 3. Progressive Summarization
As chains grow, earlier thoughts get compressed in 3 tiers:
- **Full** (recent): complete thought with reasoning
- **Condensed** (medium): input + output only
- **Headline** (old): one-line summary

### 4. Decision Anchoring
High-confidence decisions are **never dropped** from context regardless of age. They anchor the entire chain.

### 5. Cross-Chain Context
When a Worker chain needs context from the parent Strategist chain, it gets the relevant parts only — not the entire parent history.

---

## Cognitive Load Balancer

When you're running a 4-layer pipeline with 52 tools making concurrent LLM calls, a single provider = rate limit wall.

```
Engine.callLLM()
       │
       ▼
CognitiveLoadBalancer.route()
       │
       ├──→ Provider A (Kimi K2.5)        ← preferred
       │         │
       │     [429 Rate Limit]
       │         │
       ├──→ Provider B (Gemini 3.1 Pro)   ← instant failover
       │         │
       │     [429 Rate Limit]
       │         │
       └──→ Provider C (Antigravity)      ← zero downtime
```

- **Zero sleep.** No exponential backoff on 429. Instant switch to next provider.
- **Priority-based routing.** Lower priority = preferred. Same priority = round-robin.
- **Automatic cooldown.** Failed providers get cooldown periods, re-enabled automatically.
- **Per-endpoint RPM tracking.** Sliding window rate limiting per provider.

---

## Safety & Rollback

### Dangerous Command Blocking
```
 ┌────────────────────────────────────────────┐
 │  BLOCKED COMMANDS (SecurityScanner)         │
 ├────────────────────────────────────────────┤
 │  rm -rf /           ✗ System destruction   │
 │  sudo *             ✗ Privilege escalation  │
 │  curl | bash        ✗ Remote code execution │
 │  npm publish        ✗ Package publishing    │
 │  git push --force   ✗ History rewriting     │
 │  dd if=             ✗ Disk operations       │
 │  chmod -R 777 /     ✗ Permission nuke       │
 │  python -c socket   ✗ Reverse shell         │
 │  + 11 more patterns                        │
 └────────────────────────────────────────────┘
```

### Approval Engine
Dangerous operations require explicit human approval. Full audit trail of every approved/denied command.

### 3-Level Rollback
```
Atom failed?    → RollbackEngine.rollbackAtom()    → Undo last atom's changes
Block failed?   → RollbackEngine.rollbackBlock()   → Undo all atoms in block
Pipeline failed? → RollbackEngine.rollbackPipeline() → Undo entire forge run

Stash guard: saves WIP before rollback, restores after.
Selective: undo specific atoms by ID.
Preview: see what will be undone before doing it.
```

---

## Worker Protocol

Every Worker atom follows an **8-step protocol**. No shortcuts:

```
┌──────────────────────────────────────────────────────────────┐
│                    WORKER 8-STEP PROTOCOL                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  step1_read       What does the current code look like?      │
│       │                                                      │
│       ▼                                                      │
│  step2_context    What patterns exist? What's the style?     │
│       │                                                      │
│       ▼                                                      │
│  step3_impact     What will this change affect?              │
│       │                                                      │
│       ▼                                                      │
│  step4_decide     Exactly what changes will I make?          │
│       │                                                      │
│       ▼                                                      │
│  step5_predict    What should happen after my changes?       │
│       │                                                      │
│       ▼                                                      │
│  step6_execute    Make the changes. Write the code.          │
│       │                                                      │
│       ▼                                                      │
│  step7_verify     Run build/tests. Did it work?              │
│       │                                                      │
│       ▼                                                      │
│  step8_report     Document what was done and why.            │
│                                                              │
│  If protocol is incomplete → retry (max 3)                   │
│  If retry fails → BLOCK                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Pipeline Observability

Every forge run is fully observable:

```
.foreman/observer/
├── pipeline-2026-03-01T19-30-00.jsonl    ← Every event, timestamped
├── pipeline-2026-03-01T19-30-00.md       ← Human-readable summary
└── ...
```

The **PipelineObserver** tracks:
- Every phase start/end with timing
- Every block and atom with status (passed/failed/skipped)
- Every worker input/output
- Every tool call with arguments and results
- Every review verdict with reasoning
- Token costs per phase
- Total pipeline duration and cost

Real-time streaming to Telegram — watch your pipeline execute live.

---

## Model Fallback Chain

When an LLM call fails, Foreman doesn't crash — it classifies the error and acts:

| Error Class | Action |
|------------|--------|
| `rate_limit` (429) | Retry with backoff → fallback to next model |
| `quota` | Immediate fallback to next model |
| `auth` | Skip provider, try next |
| `timeout` | Retry once → fallback |
| `overloaded` | Retry with delay → fallback |
| `context_length` | Compress context → retry |
| `fatal` | Stop, report error |

Each layer has its own model preference chain. The Worker can use a different model than the Visioner.

---

## Usage

### CLI

```bash
# Run a task through the full forge pipeline
foreman run "Add authentication to the Express API"

# Interactive REPL
foreman

# Project status
foreman status

# Task management
foreman task add "Implement dark mode"
foreman task list
foreman board                    # Kanban view

# System health
foreman doctor

# Start Telegram bot
foreman serve --telegram <token> --allow <user_id>

# Debug internals
foreman internals thoughts
foreman internals chains
foreman internals providers
```

### Telegram Bot

Set `FOREMAN_TELEGRAM_TOKEN` and run `foreman` — auto-activates Telegram gateway:

```bash
export FOREMAN_TELEGRAM_TOKEN="your_bot_token"
foreman    # Bot starts automatically
```

The bot (`@Foreman_DasBot`) supports natural chat. The LLM decides when to use direct tools vs. the full forge pipeline. Conversations persist to disk with 24h TTL.

### WhatsApp

Multi-channel support via Baileys. Telegram + WhatsApp can run simultaneously through the MessagingGateway.

---

## Project Stats

```
┌────────────────────────────────────────────┐
│           FOREMAN — BY THE NUMBERS          │
├────────────────────────────────────────────┤
│                                            │
│  Source files ................ 99           │
│  Test files .................. 53           │
│  Total lines of code ........ 57,000       │
│  Tests passing ............... 654          │
│  LLM tools .................. 52           │
│  CLI commands ................ 47           │
│  Engines ..................... 22           │
│  LLM Providers .............. 5            │
│  Git commits ................. 348          │
│  Cognitive layers ............ 4            │
│  Worker protocol steps ....... 8            │
│  Dangerous cmd patterns ...... 19           │
│  Secret detection patterns ... 13           │
│                                            │
└────────────────────────────────────────────┘
```

---

## LLM Providers

| Provider | Models | Role |
|----------|--------|------|
| **Kimi (Moonshot)** | K2.5 | Primary — fast, cost-effective |
| **Google Gemini** | 3.1 Pro | Research, review tribunal |
| **Anthropic** | Claude (Sonnet/Opus) | Complex reasoning, fallback |
| **OpenAI** | GPT-4o | General purpose, fallback |
| **Antigravity** | OpenClaw relay | Multi-model routing |

All providers are interchangeable. The CognitiveLoadBalancer routes between them automatically.

---

## Development

```bash
# Install
npm install

# Run all 654 tests
npm test

# Check engine status
npx tsx src/cli.ts status

# System health check
npx tsx src/cli.ts doctor
```

### Project Structure

```
src/
├── orchestrator.ts              # 4-layer pipeline orchestrator (2,829 lines)
├── engine.ts                    # Core engine with all 22 subsystems
├── tools.ts                     # 52 LLM tool definitions + dispatcher
├── worker-executor.ts           # 8-step protocol executor
├── prompts.ts                   # Layer-specific system prompts
├── types.ts                     # Core type system (Layer, Thought, Chain)
├── cli.ts                       # 47 CLI commands
│
├── hallucination-guard.ts       # Hook-based anti-hallucination
├── ground-truth-engine.ts       # Project fact extraction
├── fact-checker.ts              # LLM output validation
├── ground-truth-validator.ts    # Worker output verification
│
├── cognitive-router.ts          # Multi-provider load balancer
├── model-fallback.ts            # Error classification + fallback chains
├── retry.ts                     # Retry with exponential backoff
│
├── verification-engine.ts       # Build/test output parsing
├── security-scanner.ts          # Secret leaks, dependency audit
├── rollback-engine.ts           # Git-based 3-level rollback
├── approval-engine.ts           # Human-in-the-loop gates
│
├── context-intelligence.ts      # Layer-aware context management
├── context-compression.ts       # Progressive summarization
├── compaction-engine.ts         # Context window optimization
├── context-guard.ts             # Context window safety
│
├── pipeline-observer.ts         # Full pipeline observability
├── streaming-pipeline.ts        # Real-time output streaming
├── cost-tracker.ts              # Per-model cost tracking
│
├── browser-engine.ts            # Headless Chrome control
├── subagent-engine.ts           # Multi-agent orchestration
├── agent-mesh/                  # Agent registry + lifecycle
│   ├── agent-registry.ts        # Central agent management
│   ├── types.ts                 # Agent types + roles
│   └── index.ts                 # Mesh exports
│
├── messaging-gateway.ts         # Telegram/WhatsApp hub
├── telegram-channel.ts          # Telegram bot implementation
├── whatsapp-channel.ts          # WhatsApp via Baileys
│
├── git-engine.ts                # Git operations
├── edit-engine.ts               # Surgical text edits
├── batch-file-engine.ts         # Atomic multi-file writes
├── execution-engine.ts          # Shell execution + security
├── diff-engine.ts               # Diff generation + analysis
│
├── research-engine.ts           # Web search + fetch
├── web-search-engine.ts         # Brave Search integration
├── web-fetch-engine.ts          # URL content extraction
├── link-intelligence.ts         # URL classification + metadata
├── markdown-intelligence.ts     # Markdown parsing + extraction
│
├── embedding-engine.ts          # Vector embeddings
├── similarity-engine.ts         # Text similarity scoring
├── memory-manager.ts            # Persistent memory
├── memory-md-bridge.ts          # Memory ↔ Markdown sync
├── session-manager.ts           # Session persistence
├── multi-session.ts             # Multi-session coordination
├── identity-engine.ts           # Project/user identity
│
├── reviewer-gate.ts             # Independent quality tribunal
├── validators.ts                # Output validation rules
├── parser.ts                    # Structured output parsing
├── chain-repair.ts              # Chain health + repair
├── transcript-repair.ts         # Transcript reconstruction
│
├── state.ts                     # State management
├── thought-manager.ts           # Thought persistence
├── chain-manager.ts             # Chain lifecycle
├── rate-limiter.ts              # Request rate limiting
├── cache-manager.ts             # Response caching
├── task-manager.ts              # Task CRUD + lifecycle
├── task-scheduler.ts            # Task scheduling
├── cron-engine.ts               # Cron job management
├── process-registry.ts          # Background process tracking
├── command-queue.ts             # Command queuing
├── file-watcher.ts              # File change detection
├── project-detector.ts          # Project type detection
├── project-manager.ts           # Project initialization
│
├── theme.ts                     # Forge visual theme (chalk + gradient)
├── animations.ts                # CLI animations
├── config.ts                    # Configuration management
├── errors.ts                    # Error types + formatting
├── setup.ts                     # First-run setup
├── onboarding.ts                # Interactive onboarding
├── repl.ts                      # Interactive REPL
│
├── provider.ts                  # LLM provider interface
├── kimi-provider.ts             # Moonshot (Kimi K2.5)
├── gemini-provider.ts           # Google Gemini
├── anthropic-provider.ts        # Anthropic Claude
├── openai-provider.ts           # OpenAI GPT-4o
├── antigravity-provider.ts      # OpenClaw Antigravity relay
├── antigravity-oauth.ts         # OAuth flow for Antigravity
├── provider-bootstrap.ts        # Provider auto-detection
├── model-discovery.ts           # Available model detection
│
└── 53 test files                # Comprehensive test coverage
```

---

<p align="center">
  <strong>Built by <a href="https://github.com/SovranAMR">@SovranAMR</a></strong>
  <br />
  <em>Foreman doesn't guess. Foreman thinks.</em>
</p>
