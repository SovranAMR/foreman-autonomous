# Implementation Plan

## Goal
Kullanıcıdan bir bilgi istendiğinde (örneğin bir ekran görüntüsü) ve bu bilgi gelmediğinde, akışı tamamen durdurmak yerine proaktif bir varsayımda bulunarak göreve devam etme yeteneği geliştir. Bu, görevin bağlamını analiz edip (örneğin, dosya yolları, hata mesajları), en olası senaryo üzerinden bir "sahte" veri üreterek Foreman'ın çalışmaya devam etmesini sağlamalıdır. Bu mekanizma, Foreman'ın daha otonom ve akıcı çalışmasını sağlayarak kullanıcı bekleme sürelerini ortadan kaldırmayı hedefler.

## Vision
**EMOTION TARGET**: Calculated Self-Reliance. The user should feel they are observing a senior, expert system that anticipates roadblocks and autonomously fabricates the necessary components to overcome them without breaking stride. It's not guessing; it's engineering a solution from first principles based on available data. The feeling is trust and awe in its ability to handle ambiguity intelligently.

**FOCAL POINT**: The Assumption Declaration. In the execution trace (the primary UI), the focal point is the single, clear, machine-readable log entry that declares an assumption has been made. It is the critical "signal" that a non-standard event has occurred, and it must contain the what and the why. Example: `ASSUMPTION :: Synthesizing plausible file content for './src/app.test.js' based on sibling component API. Reason: User-requested screenshot of file content was not provided.`.

**COLOR PHILOSOPHY**: This applies to log output styling, not a visual UI.
1.  **Assumption Yellow (#FFD700 - Gold/Bold):** The `ASSUMPTION ::` prefix and its summary line. This color signifies a significant, non-standard but successful event. It is not an error (Red) or a warning (Orange). It is a declaration of intelligent adaptation.
2.  **Synthesized Data Gray (#888888):** Any multi-line synthesized data (e.g., generated code, mock JSON) that is printed to the log should be in a muted gray. It is secondary information, the *result* of the assumption, not the event itself.
3.  **Standard Execution White (#F9F9F9):** All other standard, successful log entries. This maintains the "pure signal" aesthetic.

**MOTION BUDGET**: The only "motion" is the flow of the execution trace.
-   **Zero Pauses:** The core principle. The introduction of an assumption must *prevent* a pause or a blocking `prompt`. The log stream should continue seamlessly.
-   **Traceability Markers:** The assumption must be given a unique ID (e.g., `ASMP-001`) that is then tagged on subsequent operations that rely on it. This creates a clear, traceable "fork" in the logic within the execution stream.

**TYPOGRAPHY HIERARCHY**: Applies to log output formatting.
1.  **The Declaration (H1):** `[TIMESTAMP] [ASSUMPTION::ASMP-001] Synthesizing data...` The most prominent line.
2.  **The Justification (H2):** ` -> Reason: {Why the assumption was needed}`
3.  **The Evidence (H3):** ` -> Context: {What data was used to make the assumption}`
4.  **The Result (Code Block):** The pretty-printed, grayed-out synthesized data itself.

**SPACE PHILOSOPHY**: Refers to log verbosity and signal-to-noise ratio.
-   **Declarative, not Conversational:** The engine states what it's doing, why, and shows the result. It does not explain its internal thought process or

## Proposed Changes (Blocks)
### Block 1
Create the foundational data models for the Assumption Engine. The file `src/foreman/assumptions/models.ts` must define and export the `Assumption` interface (containing a unique ID, reason, context, and synthesized data), the `AssumptionContext` type, and a `AssumptionReason` enum. Acceptance Criteria: The file is created, and the TypeScript types/interfaces are exported and compile without error.

### Block 2
Implement the core logic of the standalone Assumption Engine. The file `src/foreman/assumptions/engine.ts` must import models from Block 1 and export a pure function `generateAssumption(context: AssumptionContext): Assumption`. Initially, this function will contain placeholder logic to generate a plausible assumption based on the context. Acceptance Criteria: The file is created, the function is exported, and it correctly returns an object matching the `Assumption` interface.

### Block 3
Develop the specialized logger for assumption declarations. The file `src/foreman/assumptions/logger.ts` will import models from Block 1 and export a `logAssumption(assumption: Assumption)` function. This function must format and print the assumption to the execution trace, strictly adhering to the vision's Typography, Color, and Traceability ID (`ASMP-XXX`) specifications. Acceptance Criteria: Calling the function produces a multi-line string that perfectly matches the structure and style defined in the vision's "Typography Hierarchy".

### Block 4
Integrate the Assumption Engine into the main orchestrator control loop. Modify the core Foreman orchestrator file to detect when a task is about to block for user input. Instead of blocking, it will now gather context, call `generateAssumption` (from Block 2), pass the result to `logAssumption` (from Block 3), and use the synthesized data to continue the task seamlessly. Acceptance Criteria: The orchestrator no longer pauses on the targeted scenarios and instead logs an assumption and continues execution.

## Verification Plan
Automated tests and manual visual inspection.
