# Implementation Plan

## Goal
Enhance Foreman's core logic to self-trigger and continue tasks with hypothetical or assumed data when user input is pending. When I ask a user for something (like a screenshot or file) and they don't provide it, I currently get stuck. I need a new 'assumption engine' or 'proactive continuation' module.

This module should:
1.  Detect when I am in a state of waiting for user input.
2.  Analyze the context of the current task (the `work` item).
3.  Based on the task goal, generate a *hypothetical* piece of information that I was waiting for (e.g., a plausible error message from a screenshot, a sample file content).
4.  Use this hypothetical data to continue the task's next steps.
5.  Clearly flag or mark the actions taken based on assumptions, so they can be reviewed or corrected by the user later.
6.  This should be a core capability, likely integrated into the main orchestrator or a new engine it calls.

This will prevent me from getting blocked and allow me to work more like a 'senior engineer' who can make intelligent assumptions to keep a project moving forward.

## Vision
signaling rather than visual UI. This will guide the Strategist in designing the architecture for this "Assumption Engine."

OUTPUT:
**EMOTION TARGET**: Calculated Foresight. The user should not feel the agent is "guessing." They should feel they are observing a senior system that, when faced with a roadblock, logically deduces a probable path, simulates it, and continues making progress. The feeling is one of

## Proposed Changes (Blocks)
### Block 1
Define the core data models for assumptions. Create a new file `src/core/assumptions.ts` to define the TypeScript interfaces for `AssumedState`, `HypotheticalData`, and any related enums or types needed to track actions taken based on assumptions. Acceptance criteria: The file `src/core/assumptions.ts` exists, compiles without errors, and exports the necessary interfaces to represent an assumption within the system's state.

### Block 2
Implement the standalone Assumption Engine logic. Create a new file `src/engine/assumption.ts` that exports a primary function, `generateAssumption`. This function will take the current task context and a "wait state" as input and return a `HypotheticalData` object. For this initial implementation, the generation can be a placeholder (e.g., returning a mock file content string). Acceptance criteria: The file `src/engine/assumption.ts` exists and its `generateAssumption` function can be successfully imported and called, returning an object that conforms to the interfaces from Block 1.

### Block 3
Implement wait state detection in the main orchestrator loop. Modify the core orchestrator logic to detect when the system is blocked waiting for user input. This block's sole responsibility is to identify this specific state and add a log or internal event, without yet acting on it. Acceptance criteria: When Foreman enters a state of waiting for user input, a specific, new log message like "Wait state detected, pending user input for [resource]" is triggered and visible in the execution trace.

### Block 4
Integrate the Assumption Engine into the orchestrator's control flow. Modify the orchestrator loop, using the detection mechanism from Block 3 as a trigger. When a wait state is detected, the orchestrator must now call the `generateAssumption` function from the Assumption Engine (Block 2) and use the resulting hypothetical data to continue the task execution flow. Acceptance criteria: The orchestrator no longer halts on user input waits; it calls the assumption engine and proceeds with the task, using the generated hypothetical data.

### Block 5
Implement assumption flagging in the task state and final output. Update the orchestrator's state management to attach the `AssumedState` data to any work items or artifacts generated using hypothetical data. Modify the final output/reporting mechanism to clearly label these steps with a marker like "[ASSUMED]". Acceptance criteria: The final execution trace clearly distinguishes between steps executed with real data and those executed with hypothetical data, fulfilling the "Calculated Foresight" vision.

## Verification Plan
Automated tests and manual visual inspection.
