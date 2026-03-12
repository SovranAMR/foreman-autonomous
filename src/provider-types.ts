/**
 * FOREMAN — Provider-Specific LLM Message Types
 *
 * Ported from Void's sendLLMMessageTypes.ts + convertToLLMMessageService.ts.
 * Defines typed message formats for each LLM provider (Anthropic, OpenAI, Gemini)
 * and conversion utilities between them.
 *
 * Why: Each provider has unique message structures for:
 * - Tool calling (Anthropic tool_use vs OpenAI tool_calls vs Gemini functionCall)
 * - Reasoning (Anthropic thinking blocks vs OpenAI developer messages vs Gemini thinkingConfig)
 * - System messages (Anthropic separate vs OpenAI system role vs Gemini systemInstruction)
 * - Content types (text, tool results, images, etc.)
 */

// ─── ANTHROPIC MESSAGE TYPES ─────────────────────────────────

export interface AnthropicReasoningBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface AnthropicRedactedReasoning {
  type: "redacted_thinking";
  data: unknown;
}

export type AnthropicReasoning =
  | AnthropicReasoningBlock
  | AnthropicRedactedReasoning;

export type AnthropicLLMChatMessage =
  | {
      role: "assistant";
      content:
        | string
        | (
            | AnthropicReasoning
            | { type: "text"; text: string }
            | {
                type: "tool_use";
                name: string;
                input: Record<string, unknown>;
                id: string;
              }
          )[];
    }
  | {
      role: "user";
      content:
        | string
        | (
            | { type: "text"; text: string }
            | { type: "tool_result"; tool_use_id: string; content: string }
          )[];
    };

// ─── OPENAI MESSAGE TYPES ────────────────────────────────────

export type OpenAILLMChatMessage =
  | {
      role: "system" | "user" | "developer";
      content: string;
    }
  | {
      role: "assistant";
      content:
        | string
        | (
            | AnthropicReasoning
            | { type: "text"; text: string }
          )[];
      tool_calls?: Array<{
        type: "function";
        id: string;
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

// ─── GEMINI MESSAGE TYPES ────────────────────────────────────

export type GeminiLLMChatMessage =
  | {
      role: "model";
      parts: (
        | { text: string }
        | {
            functionCall: {
              id: string;
              name: string;
              args: Record<string, unknown>;
            };
          }
      )[];
    }
  | {
      role: "user";
      parts: (
        | { text: string }
        | {
            functionResponse: {
              id: string;
              name: string;
              response: { output: string };
            };
          }
      )[];
    };

// ─── UNIFIED MESSAGE TYPE ────────────────────────────────────

export type LLMChatMessage =
  | AnthropicLLMChatMessage
  | OpenAILLMChatMessage
  | GeminiLLMChatMessage;

// ─── FIM MESSAGE ─────────────────────────────────────────────

export interface LLMFIMMessage {
  prefix: string;
  suffix: string;
  stopTokens: string[];
}

// ─── TOOL CALL TYPES ─────────────────────────────────────────

export interface RawToolParamsObj {
  [paramName: string]: string | undefined;
}

export interface RawToolCallObj {
  name: string;
  rawParams: RawToolParamsObj;
  doneParams: string[];
  id: string;
  isDone: boolean;
}

// ─── CALLBACK TYPES ──────────────────────────────────────────

export type OnText = (p: {
  fullText: string;
  fullReasoning: string;
  toolCall?: RawToolCallObj;
}) => void;

export type OnFinalMessage = (p: {
  fullText: string;
  fullReasoning: string;
  toolCall?: RawToolCallObj;
  anthropicReasoning: AnthropicReasoning[] | null;
}) => void;

export type OnError = (p: {
  message: string;
  fullError: Error | null;
}) => void;

export type OnAbort = () => void;

export type AbortRef = { current: (() => void) | null };

// ─── PROVIDER NAME ───────────────────────────────────────────

export type ProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "ollama"
  | "deepseek"
  | "groq"
  | "openaiCompatible";

// ─── SIMPLE MESSAGE TYPE ─────────────────────────────────────
// Intermediate format before provider-specific conversion

export interface SimpleToolMessage {
  role: "tool";
  content: string;
  id: string;
  name: string;
  rawParams: RawToolParamsObj;
}

export interface SimpleUserMessage {
  role: "user";
  content: string;
}

export interface SimpleAssistantMessage {
  role: "assistant";
  content: string;
  anthropicReasoning: AnthropicReasoning[] | null;
}

export type SimpleLLMMessage =
  | SimpleToolMessage
  | SimpleUserMessage
  | SimpleAssistantMessage;

// ─── MESSAGE CONVERSION ─────────────────────────────────────
// Convert SimpleLLMMessage[] → provider-specific format

const CHARS_PER_TOKEN = 4;

/**
 * Trim a message content to fit within a token budget.
 * Returns the trimmed content.
 */
function trimToTokenBudget(content: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (content.length <= maxChars) return content;
  return content.substring(0, maxChars) + "\n...[trimmed]";
}

/**
 * Convert simple messages to OpenAI format with tool calls.
 */
export function convertToOpenAI(
  messages: SimpleLLMMessage[],
  systemMessage?: string,
): OpenAILLMChatMessage[] {
  const result: OpenAILLMChatMessage[] = [];

  if (systemMessage) {
    result.push({ role: "system", content: systemMessage });
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const assistantMsg: OpenAILLMChatMessage = {
        role: "assistant",
        content: msg.content,
      };
      // Check if next message is a tool result — if so, add tool_calls to this assistant message
      const nextMsg = i + 1 < messages.length ? messages[i + 1] : undefined;
      if (nextMsg && nextMsg.role === "tool") {
        (assistantMsg as any).tool_calls = [
          {
            type: "function" as const,
            id: nextMsg.id,
            function: {
              name: nextMsg.name,
              arguments: JSON.stringify(nextMsg.rawParams),
            },
          },
        ];
      }
      result.push(assistantMsg);
    } else if (msg.role === "tool") {
      result.push({
        role: "tool",
        tool_call_id: msg.id,
        content: msg.content,
      });
    }
  }

  return result;
}

/**
 * Convert simple messages to Anthropic format with tool_use blocks.
 */
export function convertToAnthropic(
  messages: SimpleLLMMessage[],
): AnthropicLLMChatMessage[] {
  const result: AnthropicLLMChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      // Check if this follows a tool result
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const content: AnthropicLLMChatMessage extends { role: "assistant" }
        ? AnthropicLLMChatMessage["content"]
        : never = [];

      // Add reasoning blocks if present
      if (msg.anthropicReasoning) {
        for (const r of msg.anthropicReasoning) {
          (content as any[]).push(r);
        }
      }

      // Add text content
      if (msg.content) {
        (content as any[]).push({ type: "text", text: msg.content });
      }

      // Check if next message is a tool result — add tool_use
      const nextMsg = i + 1 < messages.length ? messages[i + 1] : undefined;
      if (nextMsg && nextMsg.role === "tool") {
        (content as any[]).push({
          type: "tool_use",
          name: nextMsg.name,
          input: nextMsg.rawParams,
          id: nextMsg.id,
        });
      }

      result.push({
        role: "assistant",
        content: (content as any[]).length === 1 &&
          (content as any[])[0]?.type === "text"
          ? (content as any[])[0].text
          : content as any,
      });
    } else if (msg.role === "tool") {
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.id,
            content: msg.content,
          },
        ],
      });
    }
  }

  return result;
}

/**
 * Convert simple messages to Gemini format with functionCall/functionResponse.
 */
export function convertToGemini(
  messages: SimpleLLMMessage[],
): GeminiLLMChatMessage[] {
  const result: GeminiLLMChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      // Check if previous is a tool that needs functionResponse
      result.push({ role: "user", parts: [{ text: msg.content }] });
    } else if (msg.role === "assistant") {
      const parts: GeminiLLMChatMessage extends { role: "model" }
        ? GeminiLLMChatMessage["parts"]
        : never = [];

      if (msg.content) {
        (parts as any[]).push({ text: msg.content });
      }

      // Check if next message is a tool result — add functionCall
      const nextMsg = i + 1 < messages.length ? messages[i + 1] : undefined;
      if (nextMsg && nextMsg.role === "tool") {
        (parts as any[]).push({
          functionCall: {
            id: nextMsg.id,
            name: nextMsg.name,
            args: nextMsg.rawParams,
          },
        });
      }

      result.push({ role: "model", parts: parts as any });
    } else if (msg.role === "tool") {
      result.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id: msg.id,
              name: msg.name,
              response: { output: msg.content },
            },
          },
        ],
      });
    }
  }

  return result;
}

/**
 * Auto-convert messages based on provider name.
 */
export function convertMessagesForProvider(
  provider: ProviderName,
  messages: SimpleLLMMessage[],
  systemMessage?: string,
): LLMChatMessage[] {
  switch (provider) {
    case "anthropic":
      return convertToAnthropic(messages);
    case "gemini":
      return convertToGemini(messages);
    case "openai":
    case "openrouter":
    case "deepseek":
    case "groq":
    case "ollama":
    case "openaiCompatible":
    default:
      return convertToOpenAI(messages, systemMessage);
  }
}

// ─── ERROR HELPERS ───────────────────────────────────────────
// Ported from Void's sendLLMMessageTypes.ts

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return error + "";
}

export function errorDetails(fullError: Error | null): string | null {
  if (fullError === null) return null;
  if (typeof fullError === "object") {
    if (Object.keys(fullError).length === 0) return null;
    return JSON.stringify(fullError, null, 2);
  }
  return null;
}
