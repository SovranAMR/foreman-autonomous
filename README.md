
```text
    ███████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ██╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ██║
    █████╗  ██║   ██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ██║
    ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║
    ██║     ╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
```

**Atomic Thought Chain Orchestrator for Agentic Software Engineering**

Foreman is a project-scoped AI orchestrator designed to enforce discipline and tactical reasoning in automated development workflows. Unlike standard chat-based agents, Foreman operates through a structured 4-layer architecture, decomposing high-level tasks into atomic units of work (Thoughts) that are researched, validated, and executed with precision.

---

## Core Architecture: The Forge Pipeline

Foreman implements a hierarchical reasoning model where each layer constrains and directs the next, ensuring alignment with project vision and technical constraints.

```text
          ✦   ·          ·    
                 ╱█╲          
        ╔═══╗  ╱   ╲         
        ║◈◈◈║ ╱     ╲        
        ║ ▓ ║                 
        ╠═══╣  ╔═══════╗     
     ✦  ╱║╲   ║▓█▓█▓█▓║ ✦   
        ╱ ║ ╲  ╚═══════╝  *  
       ╱  ║  ╲  ░▒▓█▓▒░░    
     *  ╱       ╲ ✦ *        
```

### 1. Visioner (Layer 1: Direction)
Defines the high-level intent, aesthetic soul, and architectural WHY. It sets the boundaries for the Strategist and can be influenced by the Worker through BLOCK feedback loops.

### 2. Strategist (Layer 2: Decomposition)
Breaks the vision into manageable execution blocks and further atomizes them into actionable thoughts.

### 3. Researcher (Layer 3: Evidence)
Gathers external patterns, documentation, and project-local information. It provides the factual foundation before the Worker commits to a decision.

### 4. Worker (Layer 4: Execution)
Implements code following a strict tactical protocol.

---

## The Atomic System: Fragmentation & Precision

Foreman operates on the principle of **Fractal Decomposition**. A task is never executed in its raw form; it must be shattered into atomic units to ensure deterministic outcomes.

```text
TASK [Build Authentication System]
  │
  ├─ [LAYER 1: VISION] --> Soul & Constraints
  │
  ├─ [LAYER 2: STRATEGIST]
  │   │
  │   ├─ BLOCK A [Database Schema]
  │   │   ├─ ATOM 1: Design User Table ........... [REASON] -> [DO]
  │   │   ├─ ATOM 2: Implement Migrations ........ [REASON] -> [DO]
  │   │   └─ ATOM 3: Verify Indexes .............. [REASON] -> [DO]
  │   │
  │   └─ BLOCK B [JWT Implementation]
  │       ├─ ATOM 4: Configure Secrets ........... [REASON] -> [DO]
  │       ├─ ATOM 5: Middleware Logic ............ [REASON] -> [DO]
  │       └─ ATOM 6: Token Rotation .............. [REASON] -> [DO]
  │
  └─ [RE-FORGE] --> Continuous alignment via Reflection
```

### Atomic Unit: The Thought
The fundamental unit of Foreman is the **Thought**. Each thought follows a rigid I/O structure:
`1 Input` -> `Reasoning (Required)` -> `1 Output`

Reasoning is never empty. Every decision must be justified by context, impact analysis, and predicted outcome before the first line of code is written.

### Worker Protocol: The 8-Step Strike
Each execution atom follows the **Worker Protocol** to prevent regression and ensure quality:
1. **Read**: Analyze existing code and state.
2. **Context**: Resolve internal and external dependencies.
3. **Impact**: Predict side effects on the wider system.
4. **Decide**: Select the optimal implementation path.
5. **Predict**: Forecast the expected state after execution.
6. **Execute**: Perform the file operation or shell command.
7. **Verify**: Run tests or checks to confirm the prediction.
8. **Report**: Log the atomic change to the global state.

---

## Technical Features

- **3-Tier Memory System**: Persistent storage with relevance-based retrieval (Hot/Warm/Cold tiers).
- **Transactional State Machine**: Every transition is audited and persisted in `state.json` to prevent corruption.
- **Token Budgeting & Rate Limiting**: Built-in sliding window throttles and model rotation to prevent API exhaustion.
- **SHA-256 Response Caching**: Intelligent caching of LLM outputs to save tokens and reduce latency.
- **Interactive REPL**: A live terminal environment for project discussion, model switching, and task triggering.

---

## Installation

### Prerequisites
- **Node.js**: >= 22.x
- **NPM**: Latest stable

### Setup from Source
```bash
git clone https://github.com/SovranAMR/foreman.git
cd foreman
npm install
npm i -g .  # Installs the global 'foreman' binary
```

### Authentication
Foreman supports multiple providers with **Antigravity OAuth** as the recommended path:
```bash
foreman login  # Interactive Google Cloud OAuth flow
```

---

## Command Reference

- `foreman` - Launch the **Interactive REPL** (Chat Mode).
- `foreman run "<task>"` - Execute a task through the full 4-layer pipeline.
- `foreman init <name>` - Scaffold a new project workspace.
- `foreman status` - Display active session, memory stats, and token usage.
- `foreman doctor` - Perform system health checks and provider diagnostics.
- `foreman board` - Visual Kanban board of your project tasks.

---

## Sovereignty through Discipline

Foreman is built for engineers who refuse to accept broken, non-deterministic agent workflows. It is a thinking blade designed for surgical precision in software construction.

---
*Developed by Ali İlçel & Sov - 2026*
