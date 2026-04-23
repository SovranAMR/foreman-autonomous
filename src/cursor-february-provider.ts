/**
 * FOREMAN — Cursor Agent SDK provider (@cursor/february)
 *
 * Uses Dashboard API key + local runtime. Model id "composer-2" maps to Cursor Composer.
 * Docs: https://cursor.com/docs/api/sdk/typescript
 */

import { Agent } from "@cursor/february/agent";
import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";

const CURSOR_MODEL_ALIASES: Record<string, string> = {
  "cursor-composer-2": "composer-2",
  "composer-2": "composer-2",
};

function resolveSdkModelId(requested: string): string {
  return CURSOR_MODEL_ALIASES[requested] ?? requested;
}

function messagesToPrompt(messages: LLMMessage[]): string {
  const chunks: string[] = [];
  for (const m of messages) {
    chunks.push(`[${m.role.toUpperCase()}]\n${m.content}`);
  }
  return chunks.join("\n\n---\n\n");
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class CursorFebruaryProvider implements LLMProvider {
  readonly name = "cursor-february";
  readonly supportedModels = ["composer-2", "cursor-composer-2"] as const;

  private readonly apiKey: string;
  private readonly cwd: string;

  constructor(apiKey: string, cwd: string) {
    if (!apiKey?.trim()) {
      throw new Error("Cursor API key is empty");
    }
    this.apiKey = apiKey.trim();
    this.cwd = cwd;
  }

  async generate(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
    const sdkModel = resolveSdkModelId(options.model);
    const prompt = messagesToPrompt(messages);

    let runResult;
    try {
      runResult = await Agent.prompt(prompt, {
        apiKey: this.apiKey,
        model: { id: sdkModel },
        local: { cwd: this.cwd },
        signal: undefined,
      });
    } catch (err: any) {
      throw new Error(`Cursor SDK error: ${err?.message ?? String(err)}`);
    }

    if (runResult.status !== "finished") {
      throw new Error(`Cursor agent status: ${runResult.status}`);
    }

    const text = runResult.result ?? "";
    const inputTok = estimateTokens(prompt);
    const outputTok = estimateTokens(text);

    return {
      text,
      tokenUsage: {
        input: inputTok,
        output: outputTok,
        total: inputTok + outputTok,
      },
      model: options.model,
    };
  }
}
