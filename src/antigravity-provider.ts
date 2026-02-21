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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── ENDPOINTS ───────────────────────────────────────────────

const DAILY_ENDPOINT = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const PROD_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const GENERATE_PATH = "/v1internal:streamGenerateContent?alt=sse";

const DEFAULT_ANTIGRAVITY_VERSION = "1.16.8";

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
  "gemini-2.5-pro":       "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-flash":     "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash":     "gemini-2.0-flash",
  "gemini-pro":           "gemini-2.0-flash",
  "gemini-flash":         "gemini-2.0-flash-lite",
  // Claude models (via Antigravity)
  "claude-sonnet":        "claude-sonnet-4-20250514",
  "claude-opus":          "claude-opus-4-0520",
  "claude-haiku":         "claude-3-5-haiku-20241022",
  // Chat model aliases — map user-facing names to Cloud Code Assist internal names
  "gemini-3.1-pro-high":  "gemini-3.1-pro-high",
  "gemini-3.1-pro-low":   "gemini-3.1-pro",
  "gemini-3-flash":       "gemini-3.1-flash",
  "claude-sonnet-4.6":    "claude-3-7-sonnet",
  "claude-opus-4.6":      "claude-3-opus",
  "gpt-oss-120b":         "gpt-4o",
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

interface SSECandidate {
  content?: {
    parts?: Array<{ text?: string; thought?: boolean }>;
  };
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

/** Models available in the REPL chat mode */
export const CHAT_MODELS: Array<{ id: string; label: string; model: string }> = [
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro High",        model: "gemini-3.1-pro-high" },
  { id: "gemini-3.1-pro-low",  label: "Gemini 3.1 Pro Low",         model: "gemini-3.1-pro" },
  { id: "gemini-3-flash",      label: "Gemini 3 Flash",             model: "gemini-3.1-flash" },
  { id: "claude-sonnet-4.6",   label: "Claude Sonnet 4.6 Thinking", model: "claude-3-7-sonnet" },
  { id: "claude-opus-4.6",     label: "Claude Opus 4.6 Thinking",   model: "claude-3-opus" },
  { id: "gpt-oss-120b",        label: "GPT-OSS 120B Medium",        model: "gpt-4o" },
];

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4.6";

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
    const contents = nonSystemMsgs.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

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
    messages: Array<{ role: string; content: string }>,
    model: string,
    maxTokens: number,
  ) {
    const systemMsg = messages.find(m => m.role === "system");
    const nonSystemMsgs = messages.filter(m => m.role !== "system");

    const contents = nonSystemMsgs.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const systemParts: Array<{ text: string }> = [];
    if (systemMsg) {
      systemParts.push({ text: systemMsg.content });
    }

    return {
      project: this.credentials.projectId,
      model,
      request: {
        contents,
        ...(systemParts.length > 0 ? {
          systemInstruction: { role: "user", parts: systemParts },
        } : {}),
        generationConfig: { 
          maxOutputTokens: maxTokens,
          thinkingConfig: { 
            includeThoughts: true,
            thinkingLevel: "HIGH"
          }
        },
      },
      requestType: "agent",
      userAgent: "antigravity",
      requestId: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    };
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
}
