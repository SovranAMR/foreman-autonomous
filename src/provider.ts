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

    // Sıradaki yanıtı al veya default kullan
    const text = this.responseQueue.length > 0
      ? this.responseQueue.shift()!
      : this.defaultResponse;

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
