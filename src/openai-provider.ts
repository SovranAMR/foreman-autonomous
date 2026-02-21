/**
 * FOREMAN — OpenAI Provider
 *
 * GPT modelleri üzerinden gerçek LLM çağrısı.
 * OPENAI_API_KEY env var'dan okunur.
 */

import OpenAI from "openai";
import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";

// ─── MODEL MAPPING ───────────────────────────────────────────

const MODEL_MAP: Record<string, string> = {
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "o1": "o1",
  "o3-mini": "o3-mini",
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] ?? model;
}

// ─── PROVIDER ────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly supportedModels = [
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o3-mini",
  ] as const;

  private client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY not set. " +
        "Set it via environment variable or pass to constructor."
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async generate(
    messages: LLMMessage[],
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const openaiMessages = messages.map(m => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model: resolveModel(options.model),
      max_tokens: options.maxTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      messages: openaiMessages,
    });

    const text = response.choices[0]?.message?.content ?? "";

    return {
      text,
      tokenUsage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
    };
  }
}
