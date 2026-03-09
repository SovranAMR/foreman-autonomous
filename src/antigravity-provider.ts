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

// ─── RATE LIMIT RETRY ────────────────────────────────────────

const MAX_RETRIES = 20;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000; // cap backoff at 60s

/**
 * Fetch with automatic retry on rate limit (429) and overload (503).
 * Uses exponential backoff and respects Retry-After header.
 * The same model stays — no switching on rate limits.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label = "request",
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 5 minute timeout per request — prevents infinite hangs on stalled connections
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 300_000);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      clearTimeout(fetchTimeout);
      if (err.name === "AbortError") {
        throw new Error(`Request timeout (300s) for ${label}`);
      }
      throw err;
    }
    clearTimeout(fetchTimeout);

    if (response.status !== 429 && response.status !== 503) {
      return response;
    }

    // Hard limit check (do not retry if quota is exhausted for hours)
    try {
      const cloned = response.clone();
      const bodyText = await cloned.text();
      if (bodyText.includes("exhausted your capacity") || bodyText.includes("quota will reset")) {
        console.warn(`[provider] ${label}: Hard quota exhaustion detected, stopping retries: ${bodyText.slice(0, 100)}`);
        return response; // Return immediately to throw error to caller
      }
    } catch { /* ignore read errors */ }

    // Soft Rate limited or overloaded — retry with backoff
    lastResponse = response;
    if (attempt === MAX_RETRIES) break;

    // Check Retry-After header (seconds or date)
    const retryAfter = response.headers.get("Retry-After");
    let delayMs: number;
    if (retryAfter) {
      const secs = parseInt(retryAfter, 10);
      delayMs = !isNaN(secs) ? secs * 1000 : Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
    } else {
      delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
    }

    console.log(`[provider] ${label}: ${response.status} rate limited — retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, delayMs));
  }

  return lastResponse!;
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
  "gemini-3.1-pro-low": "gemini-3-pro-low",
  "gemini-3-flash": "gemini-3-flash",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-sonnet-4-6-thinking": "claude-sonnet-4-6",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "gpt-oss-120b": "gpt-oss-120b-medium",
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
  thoughtSignature?: string;
  id?: string; // Tool call ID — proxy-added for Claude compatibility
  functionCall?: {
    name: string;
    args: Record<string, any>;
    id?: string; // Tool call ID (may be here or on parent part)
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
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)", model: "claude-opus-4-6-thinking" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", model: "claude-sonnet-4-6" },
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)", model: "gemini-3.1-pro-high" },
  { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)", model: "gemini-3.1-pro" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", model: "gemini-3.1-flash" },
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

    // Whitelist: only accept models we know are real chat models
    // The API returns garbage internal models like tab_jump_flash_lite_preview
    const ALLOWED_PATTERNS = [
      "claude-opus", "claude-sonnet", "claude-haiku",
      "gemini-3.1", "gemini-3", "gemini-2.5", "gemini-2.0",
    ];

    const filtered = discovered.filter(m => {
      const id = m.id.toLowerCase();
      return ALLOWED_PATTERNS.some(pattern => id.includes(pattern));
    });

    if (filtered.length === 0) return; // keep fallback

    // Build model entries from discovered - but maintain our preferred order
    const models: Array<{ id: string; label: string; model: string }> = [];
    for (const m of filtered) {
      const slug = modelIdToSlug(m.id);
      models.push({
        id: slug,
        label: m.displayName,
        model: m.id,
      });
    }

    if (models.length > 0) {
      // Sort: Claude first, then Gemini high→low
      models.sort((a, b) => {
        const order = (m: typeof a) => {
          if (m.id.includes("opus")) return 0;
          if (m.id.includes("sonnet")) return 1;
          if (m.id.includes("3.1") && m.id.includes("high")) return 2;
          if (m.id.includes("3.1") && m.id.includes("low")) return 3;
          if (m.id.includes("flash")) return 4;
          return 5;
        };
        return order(a) - order(b);
      });

      CHAT_MODELS = models;
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

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4-6-thinking";

// ─── PROVIDER ────────────────────────────────────────────────

export class AntigravityProvider implements LLMProvider {
  readonly name = "google-antigravity";
  readonly supportedModels = [
    "gemini-3.1-pro-high",
    "gemini-3.1-pro-low",
    "gemini-3-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-pro",
    "gemini-flash",
    "claude-sonnet",
    "claude-sonnet-4-6-thinking",
    "claude-opus",
    "claude-opus-4-6-thinking",
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

    // Build request using shared method (includes thinkingConfig for Gemini models)
    const messages_: Array<{ role: string; content: string | any[] }> = messages.map(m => {
      // Handle images — convert to Gemini inlineData format
      if (m.images && m.images.length > 0) {
        const parts: any[] = [{ text: m.content }];
        for (const img of m.images) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    const requestBody = this.buildRequestBody(messages_, model, options.maxTokens ?? 4000);

    // Try both endpoints — daily (sandbox) first, prod fallback
    const endpoints = [DAILY_ENDPOINT, PROD_ENDPOINT];
    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
          method: "POST",
          headers: getHeaders(this.credentials.accessToken),
          body: JSON.stringify(requestBody),
        }, `generate[${model}]`);

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
            const retryResponse = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
              method: "POST",
              headers: getHeaders(this.credentials.accessToken),
              body: JSON.stringify(requestBody),
            }, `generate-retry[${model}]`);

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


        let response = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
          method: "POST",
          headers: getHeaders(this.credentials.accessToken),
          body: JSON.stringify(requestBody),

        }, `streamChat[${model}]`);


        // 401/403 → refresh token and retry
        if (response.status === 401 || response.status === 403) {
          const refreshed = await refreshAntigravityToken(
            this.credentials.refreshToken,
            this.credentials.projectId,
          );
          this.credentials = refreshed;
          saveCredentials(refreshed);

          response = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
            method: "POST",
            headers: getHeaders(this.credentials.accessToken),
            body: JSON.stringify(requestBody),
          }, `streamChat-retry[${model}]`);
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
    maxIterations = 100,
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
      // Pre-send validation: ensure proper functionCall→functionResponse pairing
      // This prevents tool_use_id mismatch errors before they happen
      for (let i = conversationMessages.length - 1; i >= 0; i--) {
        const msg = conversationMessages[i];
        if (!Array.isArray(msg.content)) continue;
        const hasFunctionCall = msg.content.some((p: any) => p.functionCall);
        const hasFunctionResponse = msg.content.some((p: any) => p.functionResponse);
        if (hasFunctionCall) {
          // Model message with functionCall — next must be user with functionResponse
          const next = conversationMessages[i + 1];
          if (!next || !Array.isArray(next.content) || !next.content.some((p: any) => p.functionResponse)) {
            console.log(`[provider] Pre-send: removing orphaned functionCall at index ${i}`);
            conversationMessages.splice(i, 1);
          }
        } else if (hasFunctionResponse) {
          // User message with functionResponse — prev must be model with functionCall
          const prev = conversationMessages[i - 1];
          if (!prev || !Array.isArray(prev.content) || !prev.content.some((p: any) => p.functionCall)) {
            console.log(`[provider] Pre-send: removing orphaned functionResponse at index ${i}`);
            conversationMessages.splice(i, 1);
          }
        }
      }

      const requestBody = this.buildRequestBody(conversationMessages, model, maxTokens, { tools: true });

      // DEBUG: Log conversation parts to find id field leaks
      if (iteration > 0) {
        for (let ci = 0; ci < requestBody.request.contents.length; ci++) {
          const c = requestBody.request.contents[ci];
          if (c.parts) {
            for (let pi = 0; pi < c.parts.length; pi++) {
              const p = c.parts[pi];
              const keys = Object.keys(p);
              if (keys.includes('id') || keys.includes('thought') || keys.includes('thoughtSignature')) {
                console.log(`[provider] DEBUG: contents[${ci}].parts[${pi}] has unexpected fields: ${keys.join(', ')}`);
              }
            }
          }
        }
      }

      const endpoints = [DAILY_ENDPOINT, PROD_ENDPOINT];
      let lastError: Error | null = null;
      let iterationComplete = false;

      for (const endpoint of endpoints) {
        try {


          let response = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
            method: "POST",
            headers: getHeaders(this.credentials.accessToken),
            body: JSON.stringify(requestBody),

          }, `streamChatWithTools[${model}] iter${iteration}`);


          if (response.status === 401 || response.status === 403) {
            const refreshed = await refreshAntigravityToken(
              this.credentials.refreshToken,
              this.credentials.projectId,
            );
            this.credentials = refreshed;
            saveCredentials(refreshed);
            response = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
              method: "POST",
              headers: getHeaders(this.credentials.accessToken),
              body: JSON.stringify(requestBody),
            }, `streamChatWithTools-retry[${model}]`);
          }

          if (!response.ok) {
            const errText = await response.text();
            // 400 with tool_use_id mismatch — repair conversation by ensuring proper pairing
            if (response.status === 400 && errText.includes("tool_use_id")) {
              console.log(`[provider] tool_use_id mismatch detected — repairing conversation`);
              // Walk through messages and ensure every functionCall has a matching functionResponse
              // and vice versa. Remove orphaned tool parts.
              const repaired: typeof conversationMessages = [];
              for (let i = 0; i < conversationMessages.length; i++) {
                const msg = conversationMessages[i];
                if (typeof msg.content === "string") {
                  repaired.push(msg);
                  continue;
                }
                if (!Array.isArray(msg.content)) {
                  repaired.push(msg);
                  continue;
                }
                const hasFunctionCall = msg.content.some((p: any) => p.functionCall);
                const hasFunctionResponse = msg.content.some((p: any) => p.functionResponse);

                if (hasFunctionCall) {
                  // Model message with function calls — only keep if the NEXT message has matching responses
                  const next = conversationMessages[i + 1];
                  if (next && Array.isArray(next.content) && next.content.some((p: any) => p.functionResponse)) {
                    repaired.push(msg);
                  } else {
                    console.log(`[provider] Stripping orphaned functionCall message at index ${i}`);
                    // Keep text parts from the message if any
                    const textParts = msg.content.filter((p: any) => p.text && !p.functionCall);
                    if (textParts.length > 0) {
                      repaired.push({ role: msg.role, content: textParts });
                    }
                  }
                } else if (hasFunctionResponse) {
                  // User message with function responses — only keep if previous was a matching call
                  const prev = repaired[repaired.length - 1];
                  if (prev && Array.isArray(prev.content) && prev.content.some((p: any) => p.functionCall)) {
                    repaired.push(msg);
                  } else {
                    console.log(`[provider] Stripping orphaned functionResponse message at index ${i}`);
                  }
                } else {
                  repaired.push(msg);
                }
              }
              conversationMessages.length = 0;
              conversationMessages.push(...repaired);
              // Retry this iteration with cleaned messages
              iterationComplete = true;
              break;
            }
            lastError = new Error(`Antigravity API error ${response.status}: ${errText.slice(0, 200)}`);
            continue;
          }

          // Collect the full response (we need to detect function calls)
          // Add 120s timeout to prevent hanging on incomplete streams
          const bodyPromise = response.text();
          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("Response read timeout (300s)")), 300_000),

          );
          const body = await Promise.race([bodyPromise, timeoutPromise]);
          console.log(`[provider] Response received: ${body.length} chars, iteration ${iteration + 1}`);
          const lines = body.split("\n");

          let iterText = "";
          const functionCalls: Array<{ name: string; args: Record<string, any>; id?: string }> = [];

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
                      // Skip thinking parts
                      if (part.thought) continue;

                      // Extract text for streaming
                      if (part.text) {
                        iterText += part.text;
                        onToken(part.text);
                      }

                      // Track function calls — preserve id from proxy for Claude pairing
                      if (part.functionCall) {
                        console.log(`[provider] functionCall: ${part.functionCall.name} (id: ${part.functionCall.id || 'none'})`);
                        functionCalls.push({
                          name: part.functionCall.name,
                          args: part.functionCall.args ?? {},
                          id: part.functionCall.id, // Proxy-generated ID for Claude tool_use matching
                        });
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
            // Echo back model parts with functionCall.id preserved.
            // The proxy sends id INSIDE functionCall (not on the part) and
            // expects it back for Claude tool_use.id matching.
            const modelParts: any[] = [];
            if (iterText) {
              modelParts.push({ text: iterText });
            }
            for (const fc of functionCalls) {
              const fcPart: any = { functionCall: { name: fc.name, args: fc.args ?? {} } };
              if (fc.id) fcPart.functionCall.id = fc.id;
              modelParts.push(fcPart);
            }
            conversationMessages.push({ role: "model", content: modelParts });

            // Execute tools and build functionResponse with matching IDs
            const toolResultParts: any[] = [];
            for (const fc of functionCalls) {
              onToolCall(fc);
              const result = await (toolExecutor ? toolExecutor(fc) : executeTool(fc));
              onToolResult(result);
              // Truncate tool results to prevent context window bloat
              const MAX_TOOL_RESULT = 8_000;
              let content = result.content;
              if (content.length > MAX_TOOL_RESULT) {
                const half = Math.floor(MAX_TOOL_RESULT / 2) - 30;
                content = content.slice(0, half)
                  + `\n\n... [${content.length - MAX_TOOL_RESULT} chars truncated] ...\n\n`
                  + content.slice(-half);
              }
              const frPart: any = {
                functionResponse: {
                  name: fc.name,
                  response: { content },
                },
              };
              // Include matching ID for Claude tool_result.tool_use_id pairing
              if (fc.id) frPart.functionResponse.id = fc.id;
              toolResultParts.push(frPart);
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

    // Max iterations reached — if we have accumulated text, return it
    // If not, make one final call WITHOUT tools to force a text response
    if (!finalText.trim()) {
      console.log(`[provider] Max iterations (${maxIterations}) reached with no final text. Forcing text-only response...`);
      try {
        conversationMessages.push({
          role: "user",
          content: "You've used all available tool calls. Please provide your final answer now based on what you've gathered so far. Do NOT call any more tools.",
        });
        const forcedBody = this.buildRequestBody(conversationMessages, model, maxTokens);
        // Remove tools to prevent further function calls
        if (forcedBody.request) {
          delete forcedBody.request.tools;
        }

        const endpoints = [DAILY_ENDPOINT, PROD_ENDPOINT];
        for (const endpoint of endpoints) {
          try {
            const response = await fetchWithRetry(`${endpoint}${GENERATE_PATH}`, {
              method: "POST",
              headers: getHeaders(this.credentials.accessToken),
              body: JSON.stringify(forcedBody),
            }, `forcedTextOnly[${model}]`);
            if (!response.ok) continue;
            const body = await response.text();
            for (const line of body.split("\n")) {
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
                          finalText += part.text;
                          onToken(part.text);
                        }
                      }
                    }
                  }
                }
                if (root.usageMetadata) {
                  totalInputTokens += root.usageMetadata.promptTokenCount ?? 0;
                  totalOutputTokens += root.usageMetadata.candidatesTokenCount ?? 0;
                }
              } catch { /* skip */ }
            }
            if (finalText.trim()) break;
          } catch { continue; }
        }
      } catch (err) {
        console.error(`[provider] Forced text response failed:`, err);
      }
    }
    return { text: finalText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
  }
}
