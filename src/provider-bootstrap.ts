import type { Engine } from "./engine.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { AntigravityProvider, loadCredentials } from "./antigravity-provider.js";
import { KimiProvider, loadKimiKey } from "./kimi-provider.js";
import { CursorFebruaryProvider } from "./cursor-february-provider.js";
import { getApiKey, getCursorApiKey } from "./setup.js";

function registerCursorFebruary(engine: Engine): void {
  const key = getCursorApiKey();
  if (!key) return;
  try {
    const cwd = engine.config.projectRoot;
    engine.providers.register(new CursorFebruaryProvider(key, cwd));
  } catch {
    // ignore
  }
}

/**
 * Bootstraps the engine with available LLM providers.
 *
 * Registration order matters: the first provider that supports a given
 * model id wins. Kimi K2.6 is Foreman's primary model, so we register it
 * first unless the user explicitly prefers Cursor (FOREMAN_PREFER_CURSOR_SDK=1).
 */
export function bootstrapProviders(engine: Engine): void {
  const preferCursor = process.env.FOREMAN_PREFER_CURSOR_SDK === "1";

  if (preferCursor) {
    registerCursorFebruary(engine);
  }

  // Kimi first — primary model per model-fallback.DEFAULT_LAYER_MODELS
  const kimiKey = loadKimiKey();
  if (kimiKey) {
    try {
      engine.providers.register(new KimiProvider(kimiKey));
    } catch {
      // ignore
    }
  }

  const antigravCreds = loadCredentials();
  if (antigravCreds) {
    try {
      engine.providers.register(new AntigravityProvider(antigravCreds));
    } catch {
      // ignore
    }
  }

  const anthropicKey = getApiKey("anthropic");
  if (anthropicKey) {
    try {
      engine.providers.register(new AnthropicProvider(anthropicKey));
    } catch {
      // ignore
    }
  }

  const openaiKey = getApiKey("openai");
  if (openaiKey) {
    try {
      engine.providers.register(new OpenAIProvider(openaiKey));
    } catch {
      // ignore
    }
  }

  const googleKey = getApiKey("google");
  if (googleKey) {
    try {
      engine.providers.register(new GeminiProvider(googleKey));
    } catch {
      // ignore
    }
  }

  if (!preferCursor) {
    registerCursorFebruary(engine);
  }
}
