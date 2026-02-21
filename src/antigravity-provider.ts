/**
 * FOREMAN — Antigravity LLM Provider
 *
 * Google Antigravity OAuth token ile Cloud Code Assist API'ye istek atar.
 * OpenClaw ile aynı endpoint ve format:
 *
 * Endpoint: https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse
 * Fallback: https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse
 *
 * Request body: { project, model, request: { contents, systemInstruction, generationConfig }, requestType: "agent" }
 * Auth: Bearer <accessToken>
 *
 * Bu provider streaming SSE yanıtını parse eder ve text + token bilgisi döndürür.
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

const DEFAULT_ANTIGRAVITY_VERSION = "1.15.8";

function getHeaders(accessToken: string): Record<string, string> {
  const version = process.env.FOREMAN_ANTIGRAVITY_VERSION || DEFAULT_ANTIGRAVITY_VERSION;
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": `antigravity/${version} ${process.platform}/${process.arch}`,
    "X-Goog-Api-Client": `gl-node/${process.versions.node}`,
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };
}

// ─── MODEL MAPPING ───────────────────────────────────────────

/** Antigravity üzerinden erişilebilen modeller */
const ANTIGRAVITY_MODELS: Record<string, string> = {
  // Gemini modelleri
  "gemini-2.5-pro":       "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-flash":     "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash":     "gemini-2.0-flash",
  "gemini-pro":           "gemini-2.0-flash",
  "gemini-flash":         "gemini-2.0-flash-lite",
  // Claude modelleri (Antigravity üzerinden)
  "claude-sonnet":        "claude-sonnet-4-20250514",
  "claude-opus":          "claude-opus-4-0520",
  "claude-haiku":         "claude-3-5-haiku-20241022",
};

function resolveModel(model: string): string {
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

      // Text extract
      if (data.candidates) {
        for (const candidate of data.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text && !part.thought) {
                fullText += part.text;
              }
            }
          }
        }
      }

      // Token usage (genelde son SSE event'te gelir)
      if (data.usageMetadata) {
        inputTokens = data.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = data.usageMetadata.candidatesTokenCount ?? outputTokens;
      }
    } catch {
      // skip unparseable lines
    }
  }

  return { text: fullText, inputTokens, outputTokens };
}

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
   * Token expired ise refresh et.
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

    // System message ayır
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

    // Request body — OpenClaw/pi-ai ile aynı format
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
      userAgent: "foreman",
      requestId: `foreman-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    };

    // İki endpoint dene — daily (sandbox) önce, prod fallback
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
}
