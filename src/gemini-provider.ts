/**
 * FOREMAN — Google Gemini Provider
 *
 * Real LLM calls via Google AI Studio / Gemini API.
 * GOOGLE_API_KEY is read from env vars or config.
 *
 * SDK: @google/genai (GA — v1.x)
 */

import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";

// ─── MODEL MAPPING ───────────────────────────────────────────

/** Short model name to Gemini API model name */
const MODEL_MAP: Record<string, string> = {
  "gemini-pro":   "gemini-2.0-flash",
  "gemini-flash": "gemini-2.0-flash-lite",
  "gemini-ultra": "gemini-2.5-pro-preview-06-05",
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] ?? model;
}

// ─── PROVIDER ────────────────────────────────────────────────

export class GeminiProvider implements LLMProvider {
  readonly name = "google";
  readonly supportedModels = [
    "gemini-pro",
    "gemini-flash",
    "gemini-ultra",
  ] as const;

  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GOOGLE_API_KEY not set. " +
        "Set it via environment variable or pass to constructor. " +
        "Get one at https://aistudio.google.com/apikey"
      );
    }
    this.client = new GoogleGenAI({ apiKey: key });
  }

  async generate(
    messages: LLMMessage[],
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const model = resolveModel(options.model);

    // Separate system message
    const systemMsg = messages.find(m => m.role === "system");
    const nonSystemMsgs = messages.filter(m => m.role !== "system");

    // Gemini format: contents dizisi
    const contents = nonSystemMsgs.map(m => ({
      role: m.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: m.content }],
    }));

    const response = await this.client.models.generateContent({
      model,
      contents,
      config: {
        maxOutputTokens: options.maxTokens ?? 4000,
        ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      },
    });

    // Extract text
    const text = response.text ?? "";

    // Token usage
    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    return {
      text,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      model,
    };
  }
}
