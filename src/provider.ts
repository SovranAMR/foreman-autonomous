/**
 * FOREMAN — LLM Provider Abstraction
 *
 * For using multiple LLM providers through a single interface.
 * Engine makes LLM calls through this interface —
 * it doesn't need to know which provider it is.
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface LLMImagePart {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional image attachments for vision models */
  images?: LLMImagePart[];
}

export interface GenerateOptions {
  /** Model identifier: "claude-opus", "gpt-4o", "gemini-pro" etc. */
  model: string;

  /** Max output token */
  maxTokens?: number;

  /** Temperature (0-2) */
  temperature?: number;
}

export interface GenerateResult {
  /** Generated text */
  text: string;

  /** Token count used (input + output) */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };

  /** Model used */
  model: string;
}

// ─── PROVIDER INTERFACE ──────────────────────────────────────

/**
 * LLM Provider interface.
 * Each provider (Anthropic, OpenAI, Google) implements this.
 */
export interface LLMProvider {
  /** Provider name */
  readonly name: string;

  /** Models supported by this provider */
  readonly supportedModels: readonly string[];

  /** Generate text */
  generate(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult>;
}

// ─── MOCK PROVIDER ───────────────────────────────────────────

/**
 * Mock LLM provider for testing.
 * Does not make real LLM calls — returns fixed or programmable responses.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly supportedModels = ["mock-model"] as const;

  private responseQueue: string[] = [];
  private defaultResponse: string;
  public callHistory: Array<{ messages: LLMMessage[]; options: GenerateOptions }> = [];

  constructor(defaultResponse: string = "Mock response") {
    this.defaultResponse = defaultResponse;
  }

  /**
   * Queue responses for the next N calls.
   */
  enqueueResponses(...responses: string[]): void {
    this.responseQueue.push(...responses);
  }

  async generate(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
    // Record the call
    this.callHistory.push({ messages: [...messages], options: { ...options } });

    // Get next queued response or use smart default
    let text: string;
    if (this.responseQueue.length > 0) {
      text = this.responseQueue.shift()!;
    } else if (this.defaultResponse !== "Mock response") {
      text = this.defaultResponse;
    } else {
      // Smart mock: detect phase from system prompt and generate response in appropriate format
      text = this.generateSmartResponse(messages);
    }

    // Token simulation: based on input + output character count
    const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const outputChars = text.length;

    return {
      text,
      tokenUsage: {
        input: Math.ceil(inputChars / 4),  // ~4 char per token
        output: Math.ceil(outputChars / 4),
        total: Math.ceil((inputChars + outputChars) / 4),
      },
      model: options.model,
    };
  }

  /**
   * Detect phase from system prompt and generate mock response in a format the parser will accept.
   */
  private generateSmartResponse(messages: LLMMessage[]): string {
    const systemPrompt = messages.find(m => m.role === "system")?.content ?? "";
    const userPrompt = messages.find(m => m.role === "user")?.content ?? "";

    // Extract task from user prompt
    const taskMatch = userPrompt.match(/(?:Your Task:|Project:)\s*(.*)/s);
    const task = taskMatch?.[1]?.trim().slice(0, 100) ?? "the given task";

    if (systemPrompt.includes("VISIONER")) {
      return `REASONING: Analyzing the project requirements for "${task}". The key is to create something that feels purposeful and well-crafted. Every decision should serve the core experience.
OUTPUT: Vision for this project:
1. CLARITY: Every element serves a purpose — no decoration without function
2. QUALITY: Each piece must work correctly before moving to the next
3. SIMPLICITY: The simplest approach that fully solves the problem
The project succeeds when a user can accomplish their goal without friction.
CONFIDENCE: 0.85
NEEDS_RESEARCH: false`;
    }

    if (systemPrompt.includes("STRATEGIST") && (systemPrompt.includes("DECOMPOSE") || userPrompt.includes("break") || userPrompt.includes("blocks"))) {
      // Atomize veya Decompose — user prompt'a bak
      if (userPrompt.includes("atomic") || userPrompt.includes("atom")) {
        return `OUTPUT:
1. Set up the foundation structure and base configuration
2. Implement the core logic and data handling
3. Build the interface layer and user-facing components
4. Add validation, error handling, and edge cases
CONFIDENCE: 0.82`;
      }
      return `REASONING: Breaking down the project into logical, independent blocks. Each block has clear boundaries and can be developed separately. Dependencies flow top-to-bottom.
OUTPUT:
Block 1: Foundation — Project structure, configuration, base dependencies
Block 2: Core Logic — Main functionality and data processing
Block 3: Interface — User-facing layer, components, layout
Block 4: Integration — Connect core logic to interface
Block 5: Polish — Error handling, edge cases, performance
CONFIDENCE: 0.80`;
    }

    if (systemPrompt.includes("RESEARCHER")) {
      return `FINDINGS: Based on analysis of the requirements:
- Standard industry approach is well-documented and proven
- Key consideration: modularity and testability should be priorities
- Best practice: incremental development with verification at each step
- Similar projects succeed when they maintain clear separation of concerns
RELEVANCE: 0.75
RISKS: Main risk is scope creep — keep each atom focused on a single change`;
    }

    if (systemPrompt.includes("WORKER") || systemPrompt.includes("8-Step Protocol")) {
      return `STEP1_READ: Examined the current project state and target area. Found the existing structure and identified where changes need to be made.
STEP2_CONTEXT: The change sits within the existing module structure. Dependencies are clear: imports from core types, exports to the interface layer.
STEP3_IMPACT: This change is isolated to the target file. No side effects on other modules. Tests should continue passing.
STEP4_DECIDE: Will implement the required change in the target file, following established patterns in the codebase.
STEP5_PREDICT: After this change, the module will handle the new requirement. Build should pass, functionality should work as specified.
STEP6_EXECUTE: Implemented the change following the 8-step protocol. Code follows existing conventions and style.
STEP7_VERIFY: Build passes. The change works as predicted. No regressions detected.
STEP8_REPORT: Task completed successfully. The implementation is clean and follows project conventions. No unexpected issues.
CONFIDENCE: 0.85`;
    }

    if (systemPrompt.includes("REFLECTION")) {
      return `REASONING: Reviewing work completed so far. The implementation aligns with the original vision's principles. Quality is consistent across completed atoms. No signs of drift or rushing.
OUTPUT: Work is on track. Continue with the current plan. All completed atoms are consistent with the vision. Recommend maintaining the current pace and quality level.
CONFIDENCE: 0.88`;
    }

    // Fallback — generic parseable format
    return `REASONING: Processing the request based on available context and requirements.
OUTPUT: Task processed successfully. The approach follows established patterns and best practices.
CONFIDENCE: 0.75
NEEDS_RESEARCH: false`;
  }
}

// ─── PROVIDER REGISTRY ───────────────────────────────────────

/**
 * Registry that selects provider by model name.
 * Engine uses this to call the correct provider.
 */
export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private modelToProvider: Map<string, string> = new Map();

  /**
   * Provider kaydet.
   */
  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
    for (const model of provider.supportedModels) {
      this.modelToProvider.set(model, provider.name);
    }
  }

  /**
   * Find provider by model name.
   */
  getProviderForModel(model: string): LLMProvider | null {
    // Exact match
    const providerName = this.modelToProvider.get(model);
    if (providerName) {
      return this.providers.get(providerName) ?? null;
    }

    // Prefix match (e.g., "claude-" → anthropic provider)
    for (const [, provider] of this.providers) {
      if (provider.supportedModels.some(m => model.startsWith(m.split("-")[0]))) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Number of registered providers.
   */
  get size(): number {
    return this.providers.size;
  }
}
