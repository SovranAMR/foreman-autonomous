/**
 * FOREMAN — Antigravity LLM Provider
 *
 * Sends requests to the Cloud Code Assist API using Google Antigravity OAuth tokens.
 * Uses the same endpoint and format as OpenClaw:
 *
 * Endpoint: https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse
 * Fallback: https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
 *
 * Request body: { project, model, request: { contents, systemInstruction, generationConfig }, requestType: "agent" }
 * Auth: Bearer <accessToken>
 *
 * This provider parses the streaming SSE response and returns text + token info.
 */

import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";
import { refreshAntigravityToken, type AntigravityCredentials } from "./antigravity-oauth.js";
export type { AntigravityCredentials };
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── ENDPOINTS ───────────────────────────────────────────────

const DAILY_ENDPOINT = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const PROD_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const GENERATE_PATH = "/v1internal:streamGenerateContent?alt=sse";

const DEFAULT_ANTIGRAVITY_VERSION = "1.18.3";

function getHeaders(accessToken: string): Record<string, string> {
  const version = process.env.FOREMAN_ANTIGRAVITY_VERSION || DEFAULT_ANTIGRAVITY_VERSION;
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": `antigravity/${version} ${platform}/${arch}`,
    "X-Goog-Api-Client": `gl-node/${process.versions.node} antigravity/${version}`,
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };
}

// ─── MODEL MAPPING ───────────────────────────────────────────

/** Models accessible via Antigravity */
const ANTIGRAVITY_MODELS: Record<string, string> = {
  // Gemini models
  "gemini-2.5-pro": "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-flash": "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-pro": "gemini-2.0-flash",
  "gemini-flash": "gemini-2.0-flash-lite",
  // Claude models (via Antigravity)
  "claude-sonnet": "claude-sonnet-4-5",
  "claude-opus": "claude-opus-4-5",
  "claude-haiku": "claude-3-5-haiku-20241022",
  // Chat model aliases — map user-facing names to Cloud Code Assist internal names
  "gemini-3.1-pro-high": "gemini-3.1-pro-high",
  "gemini-3.1-pro-low": "gemini-3.1-pro",
  "gemini-3-flash": "gemini-3.1-flash",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

function resolveModel(model: string): string {
  // If it's already a chat model ID, it might be in CHAT_MODELS
  const chatEntry = CHAT_MODELS.find(m => m.id === model);
  if (chatEntry) return chatEntry.model;
  return ANTIGRAVITY_MODELS[model] ?? model;
}

// ─── CREDENTIALS STORE ───────────────────────────────────────

const CREDS_FILE = join(homedir(), ".foreman", "antigravity-creds.json");

export function loadCredentials(): AntigravityCredentials | null {
  if (!existsSync(CREDS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CREDS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function saveCredentials(creds: AntigravityCredentials): void {
  const dir = join(homedir(), ".foreman");
  if (!existsSync(dir)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

// ─── SSE PARSER ──────────────────────────────────────────────

interface SSEPart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
}

interface SSECandidate {
  content?: {
    parts?: SSEPart[];
  };
  finishReason?: string;
}

interface SSEData {
  candidates?: SSECandidate[];
  /** Some response formats include text at the top level */
  text?: string;
  /** Nested response structure used by some models */
  response?: {
    candidates?: SSECandidate[];
    text?: string;
    usageMetadata?: SSEData["usageMetadata"];
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

function parseSSEResponse(body: string): { text: string; inputTokens: number; outputTokens: number } {
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  // SSE format: "data: {...}\n\n"
  const lines = body.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === "[DONE]") continue;

    try {
      const data: SSEData = JSON.parse(jsonStr);

      // Handle both top-level and nested response structure
      const root = data.response ?? data;

      // Extract text from candidates
      if (root.candidates) {
        for (const candidate of root.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text && !part.thought) {
                fullText += part.text;
              }
            }
          }
        }
      }

      // Extract text from top-level text field
      if (root.text) {
        fullText += root.text;
      }

      // Token usage
      const usage = root.usageMetadata;
      if (usage) {
        inputTokens = usage.promptTokenCount ?? inputTokens;
        outputTokens = usage.candidatesTokenCount ?? outputTokens;
      }
    } catch {
      // skip unparseable lines
    }
  }

  return { text: fullText, inputTokens, outputTokens };
}

// ─── CHAT MODELS (for REPL) ──────────────────────────────────

import { discoverModels, type DiscoveredModel } from "./model-discovery.js";
import { toGeminiFunctionDeclarations, executeTool, type ToolCall, type ToolResult } from "./tools.js";

/** Hardcoded fallback — used only if API discovery fails */
const FALLBACK_CHAT_MODELS: Array<{ id: string; label: string; model: string }> = [
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)", model: "gemini-3.1-pro-high" },
  { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)", model: "gemini-3.1-pro" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", model: "gemini-3.1-flash" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", model: "claude-sonnet-4-6" },
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)", model: "claude-opus-4-6-thinking" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", model: "gpt-oss-120b-medium" },
];

/** Models available in the REPL chat mode — dynamically updated by discovery */
export let CHAT_MODELS: Array<{ id: string; label: string; model: string }> = [...FALLBACK_CHAT_MODELS];

/**
 * Convert a discovered model ID into a user-friendly slug.
 * e.g. "gemini-3.1-pro-high" → "gemini-3.1-pro-high" (already good)
 */
function modelIdToSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

/**
 * Refresh the CHAT_MODELS list from the API.
 * Call this after obtaining credentials. Non-blocking — failures are silent.
 */
export async function refreshChatModels(creds: AntigravityCredentials): Promise<void> {
  try {
    const discovered = await discoverModels(creds);
    if (discovered.length === 0) return; // keep fallback

    const models: Array<{ id: string; label: string; model: string }> = [];

    for (const m of discovered) {
      const slug = modelIdToSlug(m.id);
      models.push({
        id: slug,
        label: m.displayName,
        model: m.id,
      });
    }

    if (models.length > 0) {
      CHAT_MODELS = models;
      // Also update the ANTIGRAVITY_MODELS mapping so resolveModel() works
      for (const m of models) {
        ANTIGRAVITY_MODELS[m.id] = m.model;
      }
    }
  } catch {
    // Silent — keep fallback models
  }
}

/** Get the current chat models list */
export function getChatModels(): Array<{ id: string; label: string; model: string }> {
  return CHAT_MODELS;
}

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6";

// ─── PROVIDER ────────────────────────────────────────────────

export class AntigravityProvider implements LLMProvider {
  readonly name = "google-antigravity";
  readonly supportedModels = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-pro",
    "gemini-flash",
    "claude-sonnet",
    "claude-opus",
    "claude-haiku",
  ] as const;

  private credentials: AntigravityCredentials;

  constructor(credentials: AntigravityCredentials) {
    this.credentials = credentials;
  }

  /**
   * Refresh token if expired.
   */
  private async ensureValidToken(): Promise<void> {
    if (Date.now() >= this.credentials.expiresAt) {
      const refreshed = await refreshAntigravityToken(
        this.credentials.refreshToken,
        this.credentials.projectId,
      );
      this.credentials = refreshed;
      saveCredentials(refreshed);
    }
  }

  async generate(
    messages: LLMMessage[],
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    await this.ensureValidToken();

    const model = resolveModel(options.model);

    // Separate system message
    const systemMsg = messages.find(m => m.role === "system");
    const nonSystemMsgs = messages.filter(m => m.role !== "system");

    // Contents
    const contents = nonSystemMsgs.map(m => {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: m.content },
      ];
      // Attach images as inline data (Gemini vision API format)
      if (m.images && m.images.length > 0) {
        for (const img of m.images) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64,
            },
          });
        }
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    // System instruction
    const systemParts: Array<{ text: string }> = [];
    if (systemMsg) {
      systemParts.push({ text: systemMsg.content });
    }

    // Request body — same format as OpenClaw/pi-ai
    const requestBody = {
      project: this.credentials.projectId,
      model,
      request: {
        contents,
        ...(systemParts.length > 0 ? {
          systemInstruction: {
            role: "user",
            parts: systemParts,
          },
        } : {}),
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 4000,
        },
      },
      requestType: "agent",
      userAgent: "antigravity",
      requestId: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    };

    // Try both endpoints — daily (sandbox) first, prod fallback
    const endpoints = [DAILY_ENDPOINT, PROD_ENDPOINT];
    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}${GENERATE_PATH}`, {
          method: "POST",
          headers: getHeaders(this.credentials.accessToken),
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();

          // 401/403 → token expired, refresh and retry
          if (response.status === 401 || response.status === 403) {
            const refreshed = await refreshAntigravityToken(
              this.credentials.refreshToken,
              this.credentials.projectId,
            );
            this.credentials = refreshed;
            saveCredentials(refreshed);

            // Retry with new token
            const retryResponse = await fetch(`${endpoint}${GENERATE_PATH}`, {
              method: "POST",
              headers: getHeaders(this.credentials.accessToken),
              body: JSON.stringify(requestBody),
            });

            if (!retryResponse.ok) {
              lastError = new Error(`Antigravity API error ${retryResponse.status}: ${await retryResponse.text()}`);
              continue;
            }

            const retryBody = await retryResponse.text();
            const parsed = parseSSEResponse(retryBody);

            return {
              text: parsed.text,
              tokenUsage: {
                input: parsed.inputTokens,
                output: parsed.outputTokens,
                total: parsed.inputTokens + parsed.outputTokens,
              },
              model,
            };
          }

          // 404 → model or path not found on this endpoint, try next
          lastError = new Error(`Antigravity API error ${response.status}: ${errText.slice(0, 200)}`);
          continue;
        }

        const body = await response.text();
        const parsed = parseSSEResponse(body);

        return {
          text: parsed.text,
          tokenUsage: {
            input: parsed.inputTokens,
            output: parsed.outputTokens,
            total: parsed.inputTokens + parsed.outputTokens,
          },
          model,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("All Antigravity endpoints failed");
  }

  /**
   * Build the request body shared between generate() and streamChat().
   */
  private buildRequestBody(
    messages: Array<{ role: string; content: string | any[] }>,
    model: string,
    maxTokens: number,
    options?: { tools?: boolean },
  ) {
    const systemMsg = messages.find(m => m.role === "system");
    const nonSystemMsgs = messages.filter(m => m.role !== "system");

    const contents = nonSystemMsgs.map(m => {
      const role = m.role === "assistant" || m.role === "model" ? "model" : "user";
      // Support both string content and pre-built parts arrays
      if (typeof m.content === "string") {
        return {
          role,
          parts: [{ text: m.content }],
        };
      }
      return {
        role,
        parts: m.content,
      };
    });

    const systemParts: Array<{ text: string }> = [];
    if (systemMsg && typeof systemMsg.content === "string") {
      systemParts.push({ text: systemMsg.content });
    }

    const body: any = {
      project: this.credentials.projectId,
      model,
      request: {
        contents,
        ...(systemParts.length > 0 ? {
          systemInstruction: { role: "user", parts: systemParts },
        } : {}),
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(model.startsWith("gemini") ? {
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: "HIGH",
            },
          } : {}),
        },
      },
      requestType: "agent",
      userAgent: "antigravity",
      requestId: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    };

    // Add tool declarations if requested
    if (options?.tools) {
      body.request.tools = [{ functionDeclarations: toGeminiFunctionDeclarations() }];
    }

    return body;
  }

  /**
   * Stream a chat completion — yields text chunks as they arrive from SSE.
   * Used by the REPL for real-time token streaming.
   */
  async streamChat(
    messages: Array<{ role: string; content: string }>,
    modelId: string,
    onToken: (token: string) => void,
    maxTokens = 4096,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    await this.ensureValidToken();

    // Resolve model: check CHAT_MODELS first, then fall back to ANTIGRAVITY_MODELS
    const chatEntry = CHAT_MODELS.find(m => m.id === modelId);
    const model = chatEntry ? chatEntry.model : resolveModel(modelId);

    const requestBody = this.buildRequestBody(messages, model, maxTokens);

    const endpoints = [DAILY_ENDPOINT, PROD_ENDPOINT];
    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        let response = await fetch(`${endpoint}${GENERATE_PATH}`, {
          method: "POST",
          headers: getHeaders(this.credentials.accessToken),
          body: JSON.stringify(requestBody),
        });

        // 401/403 → refresh token and retry
        if (response.status === 401 || response.status === 403) {
          const refreshed = await refreshAntigravityToken(
            this.credentials.refreshToken,
            this.credentials.projectId,
          );
          this.credentials = refreshed;
          saveCredentials(refreshed);

          response = await fetch(`${endpoint}${GENERATE_PATH}`, {
            method: "POST",
            headers: getHeaders(this.credentials.accessToken),
            body: JSON.stringify(requestBody),
          });
        }

        if (!response.ok) {
          const errText = await response.text();
          // 404 or other errors -> model/path not found on this endpoint, try next
          lastError = new Error(`Antigravity API error ${response.status}: ${errText.slice(0, 200)}`);
          continue;
        }

        // Stream the response body
        if (!response.body) {
          // Fallback: read entire body and parse
          const body = await response.text();
          const parsed = parseSSEResponse(body);
          if (parsed.text) onToken(parsed.text);
          return parsed;
        }

        let fullText = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let buffer = "";

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep incomplete last line

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const data: SSEData = JSON.parse(jsonStr);
              const root = data.response ?? data;

              if (root.candidates) {
                for (const candidate of root.candidates) {
                  if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text && !part.thought) {
                        fullText += part.text;
                        onToken(part.text);
                      }
                    }
                  }
                }
              }

              // Top-level text field
              if (root.text) {
                fullText += root.text;
                onToken(root.text);
              }

              if (root.usageMetadata) {
                inputTokens = root.usageMetadata.promptTokenCount ?? inputTokens;
                outputTokens = root.usageMetadata.candidatesTokenCount ?? outputTokens;
              }
            } catch {
              // skip unparseable lines
            }
          }
        }

        // Process any remaining buffer
        if (buffer.startsWith("data: ")) {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr && jsonStr !== "[DONE]") {
            try {
              const data: SSEData = JSON.parse(jsonStr);
              const root = data.response ?? data;

              if (root.candidates) {
                for (const candidate of root.candidates) {
                  if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text && !part.thought) {
                        fullText += part.text;
                        onToken(part.text);
                      }
                    }
                  }
                }
              }
              // Top-level text field
              if (root.text) {
                fullText += root.text;
                onToken(root.text);
              }
              if (root.usageMetadata) {
                inputTokens = root.usageMetadata.promptTokenCount ?? inputTokens;
                outputTokens = root.usageMetadata.candidatesTokenCount ?? outputTokens;
              }
            } catch { /* ignore */ }
          }
        }

        return { text: fullText, inputTokens, outputTokens };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("All Antigravity endpoints failed");
  }

  /**
   * Stream chat with tool calling support (agentic loop).
   * The model can invoke tools, receive results, and continue the conversation
   * until it produces a final text response.
   */
  async streamChatWithTools(
    messages: Array<{ role: string; content: string | any[] }>,
    modelId: string,
    onToken: (token: string) => void,
    onToolCall: (call: ToolCall) => void,
    onToolResult: (result: ToolResult) => void,
    maxTokens = 32768,
    maxIterations = 25,
    toolExecutor?: (call: ToolCall) => ToolResult | Promise<ToolResult>,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    await this.ensureValidToken();

    const chatEntry = CHAT_MODELS.find(m => m.id === modelId);
    const model = chatEntry ? chatEntry.model : resolveModel(modelId);

    // Build conversation messages that we'll extend with tool results
    const conversationMessages = [...messages];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalText = "";

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const requestBody = this.buildRequestBody(conversationMessages, model, maxTokens, { tools: true });

      const endpoints = [DAILY_ENDPOINT, PROD_ENDPOINT];
      let lastError: Error | null = null;
      let iterationComplete = false;

      for (const endpoint of endpoints) {
        try {
          let response = await fetch(`${endpoint}${GENERATE_PATH}`, {
            method: "POST",
            headers: getHeaders(this.credentials.accessToken),
            body: JSON.stringify(requestBody),
          });

          if (response.status === 401 || response.status === 403) {
            const refreshed = await refreshAntigravityToken(
              this.credentials.refreshToken,
              this.credentials.projectId,
            );
            this.credentials = refreshed;
            saveCredentials(refreshed);
            response = await fetch(`${endpoint}${GENERATE_PATH}`, {
              method: "POST",
              headers: getHeaders(this.credentials.accessToken),
              body: JSON.stringify(requestBody),
            });
          }

          if (!response.ok) {
            const errText = await response.text();
            lastError = new Error(`Antigravity API error ${response.status}: ${errText.slice(0, 200)}`);
            continue;
          }

          // Collect the full response (we need to detect function calls)
          // Add 120s timeout to prevent hanging on incomplete streams
          const bodyPromise = response.text();
          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("Response read timeout (120s)")), 120_000),
          );
          const body = await Promise.race([bodyPromise, timeoutPromise]);
          console.log(`[provider] Response received: ${body.length} chars, iteration ${iteration + 1}`);
          const lines = body.split("\n");

          let iterText = "";
          const functionCalls: Array<{ name: string; args: Record<string, any> }> = [];
          const thoughtParts: any[] = []; // Gemini thought parts with signatures
          const rawFunctionCallParts: any[] = []; // Raw parts to echo back exactly

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const data: SSEData = JSON.parse(jsonStr);
              const root = data.response ?? data;

              if (root.candidates) {
                for (const candidate of root.candidates) {
                  if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                      // Thinking text (internal reasoning) — skip from output
                      if (part.thought && part.text) {
                        // Don't push to thoughtParts — these are pure thinking, 
                        // not needed for echo. The thoughtSignature on function
                        // call and text parts is what the API needs.
                        continue;
                      }

                      // Function call with thoughtSignature — preserve ENTIRE raw part
                      if (part.functionCall) {
                        functionCalls.push({
                          name: part.functionCall.name,
                          args: part.functionCall.args,
                        });
                        // Keep raw part with thoughtSignature intact
                        rawFunctionCallParts.push(part);
                        continue;
                      }

                      // Normal text output (may have thoughtSignature)
                      if (part.text && !part.thought) {
                        iterText += part.text;
                        onToken(part.text);
                        // Keep raw part if it has thoughtSignature
                        if (part.thoughtSignature) {
                          thoughtParts.push(part);
                        }
                      }
                    }
                  }
                }
              }

              if (root.usageMetadata) {
                totalInputTokens += root.usageMetadata.promptTokenCount ?? 0;
                totalOutputTokens += root.usageMetadata.candidatesTokenCount ?? 0;
              }
            } catch {
              // skip
            }
          }

          // If there are function calls, execute them and loop
          if (functionCalls.length > 0) {
            // Add the model's response to conversation (with function calls)
            // CRITICAL: Echo back ALL raw parts from the model response.
            // Gemini API requires thoughtSignature on functionCall parts to be
            // preserved exactly. We use the raw parts captured during parsing.
            const modelParts: any[] = [
              ...rawFunctionCallParts, // functionCall parts WITH thoughtSignature
            ];
            // Add text parts with thoughtSignature if any
            if (thoughtParts.length > 0) {
              modelParts.unshift(...thoughtParts);
            } else if (iterText) {
              modelParts.unshift({ text: iterText });
            }
            conversationMessages.push({ role: "model", content: modelParts });

            // Execute each tool and add results
            const toolResultParts: any[] = [];
            for (const fc of functionCalls) {
              onToolCall(fc);
              const result = await (toolExecutor ? toolExecutor(fc) : executeTool(fc));
              onToolResult(result);
              toolResultParts.push({
                functionResponse: {
                  name: fc.name,
                  response: { content: result.content },
                },
              });
            }
            conversationMessages.push({ role: "user", content: toolResultParts });

            console.log(`[provider] Tool results sent, starting iteration ${iteration + 2}/${maxIterations}. Conversation: ${conversationMessages.length} messages`);

            finalText += iterText;
            iterationComplete = true;
            break; // break endpoint loop, continue iteration loop
          }

          // No function calls — final text response
          finalText += iterText;
          return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (!iterationComplete) {
        throw lastError ?? new Error("All Antigravity endpoints failed");
      }
    }

    // Max iterations reached
    return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
  }
}
