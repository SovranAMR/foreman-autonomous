# Foreman

Multi-agent thought-chain orchestrator. Takes a task, decomposes it through 4 cognitive layers (Vision → Strategy → Research → Worker), and executes it with real tools — shell, file I/O, git, web search, browser, and more.

## Architecture

```
User Task
    │
    ▼
┌─────────────┐
│  Visioner    │  Sees the big picture, defines quality standards
└──────┬──────┘
       ▼
┌─────────────┐
│  Strategist  │  Decomposes into blocks and atoms
└──────┬──────┘
       ▼
┌─────────────┐
│  Researcher  │  Gathers context, reads files, searches web
└──────┬──────┘
       ▼
┌─────────────┐
│   Worker     │  Executes: writes code, runs commands, verifies
└──────┬──────┘
       ▼
┌─────────────┐
│  Reviewer    │  Quality gate — accepts or sends back
└─────────────┘
```

Each layer uses LLM reasoning with real tool access. The Worker follows an 8-step protocol: read → context → impact → decide → predict → execute → verify → report.

## Stack

- **Language**: TypeScript (ESM, strict)
- **Runtime**: Node.js 22+
- **Test framework**: `node:test` + `node:assert`
- **LLM Providers**: Kimi (K2.5), Gemini (3.1 Pro), Anthropic (Claude), OpenAI (GPT-4o), Antigravity
- **Messaging**: Telegram bot, WhatsApp (Baileys)

## Stats

| Metric | Count |
|--------|-------|
| Source files | 89 |
| Test files | 48 |
| Total LOC | ~51,000 |
| Tests passing | 654 |
| LLM tools | 52 |
| CLI commands | 47 |
| Engines | 22 |
| Providers | 5 |
| Commits | 300+ |

## Key Components

### Engines
- **ExecutionEngine** — shell commands, file I/O, process management
- **GitEngine** — commits, branches, diffs, history
- **EditEngine** — surgical text replacements
- **VerificationEngine** — output validation, ground truth checks
- **ResearchEngine** — web search, page fetching, link analysis
- **CostTracker** — per-model token cost tracking with budget alerts
- **PipelineObserver** — full observability (JSONL logs + markdown summaries)
- **HallucinationGuard** — detects fabricated commands, files, links
- **CognitiveLoadBalancer** — routes LLM calls across providers with failover
- **SecurityScanner** — blocks dangerous shell commands
- **ApprovalEngine** — gates destructive operations
- **RollbackEngine** — git-based undo for pipeline failures

### Pipeline Features
- Automatic block/atom decomposition
- Per-atom retry with model fallback
- Block-level failure threshold (50%+ fail → abandon)
- Operation cap (max 20 per atom)
- Checkpoint/resume support
- Real-time Telegram streaming with observer
- Dangerous command filtering

### Bot
Telegram bot (`@Foreman_DasBot`) — natural chat interface. LLM decides when to use the full forge pipeline vs direct tools. Conversation persisted to disk (24h TTL).

## Usage

```bash
# CLI
npx tsx src/cli.ts run "your task here"
npx tsx src/cli.ts status
npx tsx src/cli.ts chains
npx tsx src/cli.ts serve --telegram <token> --allow <user_id>

# REPL
npx tsx src/cli.ts
```

### Telegram Auto-Activation
Set `FOREMAN_TELEGRAM_TOKEN` environment variable and run `foreman` (no arguments) to automatically start the Telegram bot:

```bash
export FOREMAN_TELEGRAM_TOKEN="your_bot_token"
foreman  # Automatically starts Telegram gateway
```

See [TELEGRAM_AUTO_ACTIVATION.md](./TELEGRAM_AUTO_ACTIVATION.md) for details.

## Development

```bash
npm install
npm test                    # Run all 654 tests
npx tsx src/cli.ts status   # Check engine status
```

## Project Structure

```
src/
├── orchestrator.ts          # 4-layer pipeline orchestrator
├── engine.ts                # Core engine with all subsystems
├── tools.ts                 # 52 LLM tool definitions + dispatcher
├── worker-executor.ts       # Extracts and executes worker operations
├── messaging-gateway.ts     # Telegram/WhatsApp bot gateway
├── kimi-provider.ts         # Kimi (Moonshot) LLM provider
├── antigravity-provider.ts  # Google Antigravity provider
├── pipeline-observer.ts     # Full pipeline observability
├── hallucination-guard.ts   # LLM output validation
├── cognitive-router.ts      # Multi-provider load balancer
├── retry.ts                 # Retry with model fallback
├── cli.ts                   # 47 CLI commands
└── ...                      # 22 engine modules, tests, types
```

---

Private repository. Built by [@SovranAMR](https://github.com/SovranAMR).
