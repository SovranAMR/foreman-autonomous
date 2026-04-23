/**
 * Cursor Dashboard HTTP API helpers (API key, Basic auth).
 * See https://cursor.com/docs/api
 */

import { loadConfig, saveConfig, type ForemanConfig } from "./setup.js";

const CURSOR_API_BASE = "https://api.cursor.com";

export function saveCursorApiKeyToConfig(apiKey: string): void {
  const cfg: ForemanConfig = loadConfig();
  cfg.cursor_api_key = apiKey.trim();
  saveConfig(cfg);
}

export function cursorBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

export async function cursorApiGetMe(apiKey: string): Promise<{
  apiKeyName?: string;
  userEmail?: string;
  createdAt?: string;
}> {
  const res = await fetch(`${CURSOR_API_BASE}/v0/me`, {
    headers: { Authorization: cursorBasicAuthHeader(apiKey) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Cursor API /v0/me ${res.status}: ${text.slice(0, 240)}`);
  }
  return JSON.parse(text) as { apiKeyName?: string; userEmail?: string; createdAt?: string };
}
