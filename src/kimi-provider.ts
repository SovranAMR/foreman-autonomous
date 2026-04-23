/**
 * FOREMAN — Kimi K2.6 LLM Provider
 *
 * OpenAI-compatible provider for Moonshot AI's Kimi K2.6 (and K2.5 back-compat).
 * Endpoint: https://api.moonshot.ai/v1/chat/completions
 *
 * K2.6 notes (platform.moonshot.ai/docs/guide/kimi-k2-6-quickstart):
 *   - 256K context (262,144 tokens)
 *   - `thinking: {type: "enabled"|"disabled"}` (default enabled)
 *   - Fixed params — any other value errors out:
 *       temperature = 1.0 (thinking) / 0.6 (instant)
 *       top_p = 0.95, n = 1, presence_penalty = 0, frequency_penalty = 0
 *   - Multi-step tool calls MUST preserve `reasoning_content` in assistant messages
 *   - With thinking enabled, `tool_choice` can only be "auto" or "none"
 *
 * Supports:
 *   - generate: non-streaming (engine / forge_pipeline)
 *   - streamChat: basic streaming chat
 *   - streamChatWithTools: agentic loop with tool calling + reasoning preservation
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { TOOL_DEFINITIONS, executeTool, type ToolCall, type ToolResult } from "./tools.js";
import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";

// ─── CONFIG ──────────────────────────────────────────────────

const KIMI_ENDPOINT = "https://api.moonshot.ai/v1/chat/completions";
const KEY_FILE = join(homedir(), ".foreman", "kimi-key");
const DEFAULT_MODEL = "kimi-k2.6";

// ─── KEY MANAGEMENT ──────────────────────────────────────────

export function loadKimiKey(): string | null {
    // Env var takes precedence — support both KIMI_API_KEY and MOONSHOT_API_KEY
    if (process.env.KIMI_API_KEY) return process.env.KIMI_API_KEY;
    if (process.env.MOONSHOT_API_KEY) return process.env.MOONSHOT_API_KEY;
    if (!existsSync(KEY_FILE)) return null;
    try {
        return readFileSync(KEY_FILE, "utf-8").trim();
    } catch {
        return null;
    }
}

export function saveKimiKey(key: string): void {
    const dir = join(homedir(), ".foreman");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(KEY_FILE, key, { mode: 0o600 });
}

// ─── MODELS ──────────────────────────────────────────────────

export const KIMI_MODELS = [
    { id: "kimi-k2.6", label: "Kimi K2.6 (thinking)", model: "kimi-k2.6" },
    { id: "kimi-k2.6-instant", label: "Kimi K2.6 (instant)", model: "kimi-k2.6" },
    { id: "kimi-k2.5", label: "Kimi K2.5", model: "kimi-k2.5" },
    { id: "kimi-k2-thinking", label: "Kimi K2 Thinking", model: "kimi-k2-thinking" },
    { id: "kimi-k2-thinking-turbo", label: "Kimi K2 Thinking Turbo", model: "kimi-k2-thinking-turbo" },
    { id: "moonshot-v1-128k", label: "Moonshot V1 128K", model: "moonshot-v1-128k" },
] as const;

export const DEFAULT_KIMI_MODEL = "kimi-k2.6";

// ─── PARAMETER POLICY ────────────────────────────────────────

/**
 * K2.5/K2.6 use a strict parameter policy — any deviation from the
 * documented values returns an HTTP 400 from Moonshot. This helper
 * produces the correct body fragment for the given model + mode.
 *
 * Returns `thinking` param only for models that support it (k2.5/k2.6).
 * `kimi-k2-thinking*` is the older family and does NOT accept the
 * `thinking` parameter (it is always thinking).
 */
function buildSamplingParams(
    resolvedModel: string,
    modelId: string,
): {
    temperature: number;
    top_p: number;
    n: number;
    presence_penalty: number;
    frequency_penalty: number;
    thinking?: { type: "enabled" | "disabled" };
} {
    const isK25or26 = /^kimi-k2\.(5|6)$/.test(resolvedModel);
    const isK2ThinkingFamily = resolvedModel.startsWith("kimi-k2-thinking");

    if (isK25or26) {
        // instant suffix on our alias disables thinking
        const thinkingDisabled = modelId.endsWith("-instant");
        return {
            temperature: thinkingDisabled ? 0.6 : 1.0,
            top_p: 0.95,
            n: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            thinking: { type: thinkingDisabled ? "disabled" : "enabled" },
        };
    }

    if (isK2ThinkingFamily) {
        // Legacy thinking models — fixed temp=1 but no `thinking` param.
        return {
            temperature: 1,
            top_p: 1,
            n: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
        };
    }

    // moonshot-v1-* and unknown — standard sampling
    return {
        temperature: 0.7,
        top_p: 1,
        n: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
    };
}

function resolveModel(modelId: string): string {
    return KIMI_MODELS.find(m => m.id === modelId)?.model ?? modelId;
}

// ─── TOOL FORMAT CONVERSION ─────────────────────────────────

function toOpenAITools(): any[] {
    return TOOL_DEFINITIONS.map(t => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        },
    }));
}

// ─── PROVIDER ────────────────────────────────────────────────

export class KimiProvider implements LLMProvider {
    readonly name = "kimi";
    readonly supportedModels = KIMI_MODELS.map(m => m.id);

    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Non-streaming generate — for engine/forge_pipeline compatibility.
     */
    async generate(messages: LLMMessage[], options: GenerateOptions): Promise<GenerateResult> {
        const model = resolveModel(options.model);
        const sampling = buildSamplingParams(model, options.model);

        // For K2.5/K2.6 we MUST use the fixed sampling values — ignore any
        // caller-provided temperature/top_p. For other models, honour caller.
        const body: Record<string, unknown> = {
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: options.maxTokens ?? 4096,
            stream: false,
            ...sampling,
        };




        const response = await fetch(KIMI_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),

        });


        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Kimi API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json() as Record<string, any>;
        const text = data.choices?.[0]?.message?.content ?? "";
        const inputTokens = data.usage?.prompt_tokens ?? 0;
        const outputTokens = data.usage?.completion_tokens ?? 0;

        return {
            text,
            tokenUsage: {
                input: inputTokens,
                output: outputTokens,
                total: inputTokens + outputTokens,
            },
            model: options.model,
        };
    }

    /**
     * Stream a chat completion — yields text chunks as they arrive.
     */
    async streamChat(
        messages: Array<{ role: string; content: string }>,
        modelId: string,
        onToken: (token: string) => void,
        maxTokens = 4096,
    ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
        const model = resolveModel(modelId);
        const sampling = buildSamplingParams(model, modelId);

        const body: Record<string, unknown> = {
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: maxTokens,
            stream: true,
            ...sampling,
        };




        const response = await fetch(KIMI_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),

        });


        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Kimi API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        return this.parseSSEStream(response, onToken);
    }

    /**
     * Stream chat with tool calling support (agentic loop).
     */
    async streamChatWithTools(
        messages: Array<{ role: string; content: string | any[] }>,
        modelId: string,
        onToken: (token: string) => void,
        onToolCall: (call: ToolCall) => void,
        onToolResult: (result: ToolResult) => void,
        maxTokens = 32768,
        maxIterations = 100,
        toolExecutor?: (call: ToolCall) => ToolResult | Promise<ToolResult>,
        abortSignal?: AbortSignal,
        pollInjectedMessages?: () => Array<{ role: string; content: string }> | undefined,
    ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
        const model = resolveModel(modelId);
        const tools = toOpenAITools();
        const sampling = buildSamplingParams(model, modelId);
        // With thinking enabled on K2.5/K2.6, tool_choice can ONLY be "auto" or "none"
        const toolChoice: "auto" | "none" = "auto";

        // OpenAI-compatible message format for tool-calling conversations
        type ChatMsg = { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; reasoning_content?: string };
        const conversationMessages: ChatMsg[] = messages.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalText = "";

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            if (abortSignal?.aborted) {
                throw new Error("streamChatWithTools aborted");
            }

            if (pollInjectedMessages) {
                const injected = pollInjectedMessages();
                if (injected && injected.length > 0) {
                    console.log(`[kimi-provider] injecting ${injected.length} steering messages into iteration ${iteration}`);
                    const combinedContent = injected.map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n\n");
                    conversationMessages.push({
                        role: "user",
                        content: combinedContent,
                    });
                }
            }

            const body: Record<string, unknown> = {
                model,
                messages: conversationMessages,
                max_tokens: maxTokens,
                stream: true,
                tools,
                tool_choice: toolChoice,
                ...sampling,
            };




            const response = await fetch(KIMI_ENDPOINT, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),

            });


            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Kimi API error ${response.status}: ${errText.slice(0, 200)}`);
            }

            // Parse streaming response — collect text + tool calls
            const { text, reasoningContent, toolCalls, inputTokens, outputTokens } = await this.parseToolStream(response, onToken);
            totalInputTokens += inputTokens;
            totalOutputTokens += outputTokens;

            // If there are tool calls, execute them and loop
            if (toolCalls.length > 0) {
                // Add assistant message with tool calls + reasoning_content
                const assistantMsg: any = {
                    role: "assistant",
                    content: text || "",
                    tool_calls: toolCalls.map(tc => ({
                        id: tc.id,
                        type: "function",
                        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                    })),
                };
                // Kimi requires reasoning_content on tool call messages when thinking is enabled
                if (reasoningContent) {
                    assistantMsg.reasoning_content = reasoningContent;
                }
                conversationMessages.push(assistantMsg);

                // Execute each tool and add results
                for (const tc of toolCalls) {
                    onToolCall({ name: tc.name, args: tc.args });
                    const result = await (toolExecutor ? toolExecutor({ name: tc.name, args: tc.args }) : executeTool({ name: tc.name, args: tc.args }));
                    onToolResult(result);

                    // Truncate large tool results
                    const MAX_TOOL_RESULT = 8_000;
                    let content = result.content;
                    if (content.length > MAX_TOOL_RESULT) {
                        const half = Math.floor(MAX_TOOL_RESULT / 2) - 30;
                        content = content.slice(0, half)
                            + `\n\n... [${content.length - MAX_TOOL_RESULT} chars truncated] ...\n\n`
                            + content.slice(-half);
                    }

                    conversationMessages.push({
                        role: "tool",
                        content,
                        tool_call_id: tc.id,
                    });
                }

                finalText += text;
                continue; // Loop for next iteration
            }

            // No tool calls — final text response
            finalText += text;
            return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
        }

        return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    }

    /**
     * Parse SSE stream for simple chat (text only).
     */
    private async parseSSEStream(
        response: Response,
        onToken: (token: string) => void,
    ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
        let fullText = "";
        let inputTokens = 0;
        let outputTokens = 0;

        if (!response.body) {
            const body = await response.text();
            return this.parseNonStreamResponse(body, onToken);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === "[DONE]") continue;

                try {
                    const data = JSON.parse(jsonStr);
                    const delta = data.choices?.[0]?.delta;
                    if (delta?.content) {
                        fullText += delta.content;
                        onToken(delta.content);
                    }
                    if (data.usage) {
                        inputTokens = data.usage.prompt_tokens ?? inputTokens;
                        outputTokens = data.usage.completion_tokens ?? outputTokens;
                    }
                } catch { /* skip */ }
            }
        }

        return { text: fullText, inputTokens, outputTokens };
    }

    /**
     * Parse SSE stream with tool call detection.
     */
    private async parseToolStream(
        response: Response,
        onToken: (token: string) => void,
    ): Promise<{
        text: string;
        reasoningContent: string;
        toolCalls: Array<{ id: string; name: string; args: Record<string, any> }>;
        inputTokens: number;
        outputTokens: number;
    }> {
        let fullText = "";
        let reasoningContent = "";
        const toolCallsMap = new Map<number, { id: string; name: string; argsStr: string }>();
        let inputTokens = 0;
        let outputTokens = 0;

        if (!response.body) {
            const body = await response.text();
            const parsed = this.parseNonStreamResponse(body, onToken);
            return { ...parsed, reasoningContent: "", toolCalls: [] };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === "[DONE]") continue;

                try {
                    const data = JSON.parse(jsonStr);
                    const delta = data.choices?.[0]?.delta;

                    // Text content
                    if (delta?.content) {
                        fullText += delta.content;
                        onToken(delta.content);
                    }

                    // Reasoning/thinking content (Kimi thinking mode)
                    if (delta?.reasoning_content) {
                        reasoningContent += delta.reasoning_content;
                    }

                    // Tool calls
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCallsMap.has(idx)) {
                                toolCallsMap.set(idx, {
                                    id: tc.id || `call_${Date.now()}_${idx}`,
                                    name: tc.function?.name || "",
                                    argsStr: "",
                                });
                            }
                            const existing = toolCallsMap.get(idx)!;
                            if (tc.id) existing.id = tc.id;
                            if (tc.function?.name) existing.name = tc.function.name;
                            if (tc.function?.arguments) existing.argsStr += tc.function.arguments;
                        }
                    }

                    // Usage
                    if (data.usage) {
                        inputTokens = data.usage.prompt_tokens ?? inputTokens;
                        outputTokens = data.usage.completion_tokens ?? outputTokens;
                    }
                } catch { /* skip */ }
            }
        }

        // Parse accumulated tool call arguments
        const toolCalls = [...toolCallsMap.values()].map(tc => {
            let args: Record<string, any> = {};
            try {
                args = JSON.parse(tc.argsStr);
            } catch { /* empty args */ }
            return { id: tc.id, name: tc.name, args };
        });

        return { text: fullText, reasoningContent, toolCalls, inputTokens, outputTokens };
    }

    /**
     * Parse a non-streaming response (fallback).
     */
    private parseNonStreamResponse(
        body: string,
        onToken: (token: string) => void,
    ): { text: string; inputTokens: number; outputTokens: number } {
        try {
            const data = JSON.parse(body);
            const text = data.choices?.[0]?.message?.content ?? "";
            if (text) onToken(text);
            return {
                text,
                inputTokens: data.usage?.prompt_tokens ?? 0,
                outputTokens: data.usage?.completion_tokens ?? 0,
            };
        } catch {
            return { text: "", inputTokens: 0, outputTokens: 0 };
        }
    }
}
