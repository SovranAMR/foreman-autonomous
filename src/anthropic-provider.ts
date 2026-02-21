/**
 * FOREMAN — Anthropic Provider
 *
 * Real LLM calls via the Claude API.
 * ANTHROPIC_API_KEY is read from env vars.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";

// ─── MODEL MAPPING ───────────────────────────────────────────

/** Short model name to Anthropic API model name */
const MODEL_MAP: Record<string, string> = {
  "claude-opus": "claude-opus-4-0520",
  "claude-sonnet": "claude-sonnet-4-20250514",
  "claude-haiku": "claude-3-5-haiku-20241022",
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] ?? model;
}

// ─── PROVIDER ────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly supportedModels = [
    "claude-opus",
    "claude-sonnet",
    "claude-haiku",
  ] as const;

  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. " +
        "Set it via environment variable or pass to constructor."
      );
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async generate(
    messages: LLMMessage[],
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    // Separate system message (Anthropic API takes a separate system param)
    const systemMsg = messages.find(m => m.role === "system");
    const nonSystemMsgs = messages.filter(m => m.role !== "system");

    // Anthropic format
    const anthropicMessages = nonSystemMsgs.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await this.client.messages.create({
      model: resolveModel(options.model),
      max_tokens: options.maxTokens ?? 4000,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: anthropicMessages,
    });

    // Extract text
    const text = response.content
      .filter(block => block.type === "text")
      .map(block => (block as { type: "text"; text: string }).text)
      .join("\n");

    return {
      text,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}
