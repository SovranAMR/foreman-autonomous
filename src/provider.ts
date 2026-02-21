/**
 * FOREMAN — LLM Provider Abstraction
 *
 * Çoklu LLM provider'ı tek arayüzle kullanmak için.
 * Engine bu interface üzerinden LLM çağrısı yapar —
 * hangi provider olduğunu bilmesine gerek yok.
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  /** Model tanımlayıcı: "claude-opus", "gpt-4o", "gemini-pro" vb. */
  model: string;

  /** Max output token */
  maxTokens?: number;

  /** Sıcaklık (0-2) */
  temperature?: number;
}

export interface GenerateResult {
  /** Üretilen metin */
  text: string;

  /** Kullanılan token sayısı (input + output) */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };

  /** Kullanılan model */
  model: string;
}

// ─── PROVIDER INTERFACE ──────────────────────────────────────

/**
 * LLM Provider arayüzü.
 * Her provider (Anthropic, OpenAI, Google) bunu implement eder.
 */
export interface LLMProvider {
  /** Provider adı */
  readonly name: string;

  /** Bu provider'ın desteklediği modeller */
  readonly supportedModels: readonly string[];

  /** Metin üret */
  generate(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult>;
}

// ─── MOCK PROVIDER ───────────────────────────────────────────

/**
 * Test için mock LLM provider.
 * Gerçek LLM çağrısı yapmaz — sabit veya programlanabilir yanıt döndürür.
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
   * Sonraki N çağrı için yanıtları sıraya koy.
   */
  enqueueResponses(...responses: string[]): void {
    this.responseQueue.push(...responses);
  }

  async generate(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
    // Çağrıyı kaydet
    this.callHistory.push({ messages: [...messages], options: { ...options } });

    // Sıradaki yanıtı al veya smart default kullan
    let text: string;
    if (this.responseQueue.length > 0) {
      text = this.responseQueue.shift()!;
    } else if (this.defaultResponse !== "Mock response") {
      text = this.defaultResponse;
    } else {
      // Smart mock: system prompt'tan phase'i algıla ve uygun formatta yanıt üret
      text = this.generateSmartResponse(messages);
    }

    // Token simülasyonu: input + output karakter sayısına göre
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
   * System prompt'tan phase algıla ve parser'ın kabul edeceği formatta mock yanıt üret.
   */
  private generateSmartResponse(messages: LLMMessage[]): string {
    const systemPrompt = messages.find(m => m.role === "system")?.content ?? "";
    const userPrompt = messages.find(m => m.role === "user")?.content ?? "";

    // Task'ı user prompt'tan çıkar
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
 * Model adından provider'ı seçen registry.
 * Engine bunu kullanarak doğru provider'ı çağırır.
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
   * Model adından provider'ı bul.
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
   * Kayıtlı provider sayısı.
   */
  get size(): number {
    return this.providers.size;
  }
}
