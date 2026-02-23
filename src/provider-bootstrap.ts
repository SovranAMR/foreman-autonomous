import type { Engine } from "./engine.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { AntigravityProvider, loadCredentials } from "./antigravity-provider.js";
import { KimiProvider, loadKimiKey } from "./kimi-provider.js";
import { getApiKey } from "./setup.js";

/**
 * Bootstraps the engine with available LLM providers.
 * Priority: Kimi > Anthropic > OpenAI > Gemini > Antigravity
 */
export function bootstrapProviders(engine: Engine): void {
  // Kimi (highest priority when configured)
  const kimiKey = loadKimiKey();
  if (kimiKey) {
    try {
      engine.providers.register(new KimiProvider(kimiKey));
    } catch {
      // ignore
    }
  }

  // Anthropic
  const anthropicKey = getApiKey("anthropic");
  if (anthropicKey) {
    try {
      engine.providers.register(new AnthropicProvider(anthropicKey));
    } catch {
      // ignore
    }
  }

  // OpenAI
  const openaiKey = getApiKey("openai");
  if (openaiKey) {
    try {
      engine.providers.register(new OpenAIProvider(openaiKey));
    } catch {
      // ignore
    }
  }

  // Gemini
  const googleKey = getApiKey("google");
  if (googleKey) {
    try {
      engine.providers.register(new GeminiProvider(googleKey));
    } catch {
      // ignore
    }
  }

  // Antigravity (OAuth) — fallback
  const antigravCreds = loadCredentials();
  if (antigravCreds) {
    try {
      engine.providers.register(new AntigravityProvider(antigravCreds));
    } catch {
      // ignore
    }
  }
}
