import type { Engine } from "./engine.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { AntigravityProvider, loadCredentials } from "./antigravity-provider.js";
import { getApiKey } from "./setup.js";

/**
 * Bootstraps the engine with available LLM providers.
 * Reads credentials from ~/.foreman/config.json and Antigravity OAuth.
 */
export function bootstrapProviders(engine: Engine): void {
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

  // Antigravity (OAuth)
  const antigravCreds = loadCredentials();
  if (antigravCreds) {
    try {
      engine.providers.register(new AntigravityProvider(antigravCreds));
    } catch {
      // ignore
    }
  }
}
