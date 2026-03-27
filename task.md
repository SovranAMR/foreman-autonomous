# Foreman Task Tracker

## Block 1: Define the core data models for assumptions. Create a new file `src/core/assumptions.ts` to define t
- [/] **Atom 1**: Create the file `src/core/assumptions.ts` containing the complete data models for the assumption engine. The file must define and export the following

## Block 2: Implement the standalone Assumption Engine logic. Create a new file `src/engine/assumption.ts` that 
- [/] **Atom 1**: Create the file `src/engine/assumption.ts` to implement the standalone Assumption Engine logic. The file must import the necessary data models (like `

## Block 3: Implement wait state detection in the main orchestrator loop. Modify the core orchestrator logic to 
- [x] **Atom 1**: Execute a recursive `grep` command across the `src/` directory to locate the file and function responsible for pausing the orchestrator to await user 
- [x] **Atom 2**: Based on the file and function identified in the previous atom, modify the code to introduce a formal wait state. This involves: a) defining a new sta

## Block 4: Integrate the Assumption Engine into the orchestrator's control flow. Modify the orchestrator loop, 
<<<<<<< Updated upstream
_Pending atomization..._
=======
- [x] **Atom 1**: Create the file `src/orchestration/engine.ts` to implement the full FSM-based orchestrator. This file must define and implement the complete logic in 
- [x] **Atom 2**: **Imports**: Import `AssumedState` from `../core/assumptions.ts`, `generateAssumption` from `../engine/assumption.ts`, `OrchestratorState` from `./sta
- [x] **Atom 3**: **State Definition**: Define an `EngineStatus` enum (e.g., `IDLE`, `AWAITING_INPUT`, `GENERATING_ASSUMPTION`, `PROCESSING`, `DONE`).
- [x] **Atom 4**: **Engine Class**: Create an `OrchestratorEngine` class containing the FSM.
- [/] **Atom 5**: **FSM Loop**: Implement a `run` method that contains a state-dispatch loop (e.g., a `while` loop with a `switch` on the current status).
- [ ] **Atom 6**: **State Transitions**:
>>>>>>> Stashed changes

## Block 5: Implement assumption flagging in the task state and final output. Update the orchestrator's state ma
_Pending atomization..._
