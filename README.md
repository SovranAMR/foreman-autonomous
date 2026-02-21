
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
- **Decompose Mode**: Breaks the vision into 5-8 logical execution blocks.
- **Atomize Mode**: Further splits blocks into 3-6 actionable Atomic Thoughts.

### 3. Researcher (Layer 3: Evidence)
Gathers external patterns, documentation, and project-local information. It provides the factual foundation before the Worker commits to a decision.

### 4. Worker (Layer 4: Execution)
Follows a strict **8-Step Tactical Protocol**:
`Read` -> `Context` -> `Impact` -> `Decide` -> `Predict` -> `Execute` -> `Verify` -> `Report`

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
Alternatively, configure keys manually:
```bash
foreman setup  # Configure Anthropic, OpenAI, or Gemini keys
```

---

## Command Reference

### Main Commands
- `foreman` - Launch the **Interactive REPL** (Chat Mode).
- `foreman run "<task>"` - Execute a task through the full 4-layer pipeline.
- `foreman init <name>` - Scaffold a new project workspace.
- `foreman status` - Display active session, memory stats, and token usage.
- `foreman doctor` - Perform system health checks and provider diagnostics.

### Project Management
- `foreman board` - Display the project task list in a Kanban format.
- `foreman task add/list/done` - Direct manipulation of project sub-tasks.

### Developer Internals
- `foreman internals memory` - Inspect the vector-like memory store.
- `foreman internals thoughts` - View the complete thought chain history.
- `foreman internals providers` - Check LLM provider availability and latency.

---

## Visual Metaphor

Foreman uses the **Blacksmith Forge** metaphor to visualize technical progress:
- **Hammering**: Active execution of a task.
- **Sparks**: Success events and token generation.
- **Embers**: System activity and heating up the context window.
- **Anvil**: The stable project state where work is shaped.

---

## Sovereignty through Discipline

Foreman is built for engineers who refuse to accept broken, non-deterministic agent workflows. It is a thinking blade designed for surgical precision in software construction.

---
*Developed by Ali İlçel & Sov - 2026*
