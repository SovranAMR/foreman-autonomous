
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

### 🧩 Atomization Schematic

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ TASK: [High-Level Objective]                                                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼                                                       ▼
┌───────────────────┐                                   ┌───────────────────┐
│ BLOCK A: Database │                                   │ BLOCK B: API Auth │
└─────────┬─────────┘                                   └─────────┬─────────┘
          │                                                       │
    ┌─────┼─────┐                                           ┌─────┼─────┐
    ▼     ▼     ▼                                           ▼     ▼     ▼
 ┌─────┐ ┌─────┐ ┌─────┐                                 ┌─────┐ ┌─────┐ ┌─────┐
 │ATOM1│ │ATOM2│ │ATOM3│                                 │ATOM4│ │ATOM5│ │ATOM6│
 └─────┘ └─────┘ └─────┘                                 └─────┘ └─────┘ └─────┘
```

### 🧠 Atomic Unit: The Thought

The fundamental unit of Foreman is the **Thought**. Each thought follows a rigid I/O structure to ensure accountability and alignment.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                               THOUGHT STRUCTURE                             │
├─────────────────┬──────────────────────────────────────────┬────────────────┤
│      INPUT      │                REASONING                 │     OUTPUT     │
├─────────────────┼──────────────────────────────────────────┼────────────────┤
│                 │ 1. [Context]   Why are we here?          │                │
│ Raw instruction │ 2. [Analysis]  Impact on the system.     │ Refined result │
│ from Strategist │ 3. [Path]      Chosen approach.          │ or Execution   │
│                 │ 4. [Outcome]   Expected result.          │                │
└─────────────────┴──────────────────────────────────────────┴────────────────┤
│       STATUS: [PENDING] -> [REASONING] -> [VALIDATING] -> [DONE]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 🔨 Worker Protocol: The 8-Step Strike

Every execution atom follows a strict tactical sequence to prevent regressions.

```text
┌────┬───────────┬────────────────────────────────────────────────────────────┐
│STEP│   ACTION  │ DESCRIPTION                                                │
├────┼───────────┼────────────────────────────────────────────────────────────┤
│ 1  │ READ      │ Scan existing code, files, and project state.              │
│ 2  │ CONTEXT   │ Resolve internal and external dependencies.                │
│ 3  │ IMPACT    │ Predict side effects and cascading changes.                │
│ 4  │ DECIDE    │ Lock in the optimal implementation strategy.                │
│ 5  │ PREDICT   │ Define exactly how the state should change.                │
│ 6  │ EXECUTE   │ Commit the change (file write, shell command, etc).        │
│ 7  │ VERIFY    │ Run tests and sanity checks against the prediction.        │
│ 8  │ REPORT    │ Finalize the change and log metrics to the state machine.  │
└────┴───────────┴────────────────────────────────────────────────────────────┘
```

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

---

## Sovereignty through Discipline

Foreman is built for engineers who refuse to accept broken, non-deterministic agent workflows. It is a thinking blade designed for surgical precision in software construction.

---
*Developed by Ali İlçel & Sov - 2026*
