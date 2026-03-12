/**
 * FOREMAN — Model Capabilities System
 *
 * Ported from Void (VS Code fork) modelCapabilities.ts
 * Provides provider-specific reasoning IO settings, model capabilities detection,
 * reasoning budget/effort slider logic, and provider auto-detection.
 *
 * No VSCode DI dependencies — pure functions and types.
 */

// ─── TYPES ───────────────────────────────────────────────────

export type ProviderName =
  | 'anthropic'
  | 'openAI'
  | 'gemini'
  | 'deepseek'
  | 'openRouter'
  | 'xAI'
  | 'groq'
  | 'mistral'
  | 'ollama'
  | 'openAICompatible';

/** How a provider handles reasoning/thinking tokens in its API */
export type ProviderReasoningIOSetting =
  | 'anthropic'   // Separate thinking blocks (thinking: { type: 'enabled', budget_tokens })
  | 'openai'      // Developer message with reasoning_effort parameter
  | 'deepseek'    // Similar to OpenAI but uses reasoning_content field
  | 'gemini'      // thinkingConfig: { thinkingBudget: number }
  | 'none';       // Provider doesn't support reasoning

/** How the reasoning budget slider works */
export type ReasoningSlider =
  | { type: 'budget_slider'; min: number; max: number; default: number }   // Anthropic: raw token budget
  | { type: 'effort_slider'; options: string[]; default: string }          // OpenAI: low/medium/high
  | null;                                                                   // No slider

export interface ReasoningCapabilities {
  /** Whether this model supports extended thinking/reasoning */
  supportsReasoning: boolean;
  /** Whether reasoning can be turned off (some models always reason) */
  canTurnOffReasoning: boolean;
  /** Slider type for reasoning budget */
  reasoningSlider: ReasoningSlider;
  /** Reserved output tokens when reasoning is enabled */
  reasoningReservedOutputTokenSpace: number;
}

export interface ModelCapabilities {
  /** Streaming support */
  supportsStreaming: boolean;
  /** Image/vision input support */
  supportsImages: boolean;
  /** Structured JSON output */
  supportsJson: boolean;
  /** System/assistant prefill (Anthropic) */
  supportsPrefill: boolean;
  /** Fill-in-middle completion */
  supportsFim: boolean;
  /** Tool/function calling */
  supportsTools: boolean;
  /** Reasoning/thinking tokens */
  supportsReasoningTokens: boolean;
  /** Maximum context window tokens */
  maxContextTokens: number;
  /** Default reserved output token space */
  reservedOutputTokenSpace: number;
  /** Reasoning capabilities (null if no reasoning support) */
  reasoningCapabilities: ReasoningCapabilities | null;
}

export interface ProviderCapabilities {
  /** How reasoning IO is handled */
  reasoningIOSetting: ProviderReasoningIOSetting;
  /** Default models for this provider */
  defaultModels: string[];
}

/** Sendable reasoning info — simplified for message construction */
export type SendableReasoningInfo =
  | { type: 'budget_slider_value'; isReasoningEnabled: true; reasoningBudget: number }
  | { type: 'effort_slider_value'; isReasoningEnabled: true; reasoningEffort: string }
  | null;

// ─── PROVIDER SETTINGS ──────────────────────────────────────

export const PROVIDER_CAPABILITIES: Record<ProviderName, ProviderCapabilities> = {
  anthropic: {
    reasoningIOSetting: 'anthropic',
    defaultModels: [
      'claude-opus-4-0',
      'claude-sonnet-4-0',
      'claude-3-7-sonnet-latest',
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
    ],
  },
  openAI: {
    reasoningIOSetting: 'openai',
    defaultModels: [
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'o3',
      'o4-mini',
    ],
  },
  gemini: {
    reasoningIOSetting: 'gemini',
    defaultModels: [
      'gemini-2.5-pro-exp-03-25',
      'gemini-2.5-flash-preview-04-17',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.5-pro-preview-05-06',
      'gemini-3.1-pro-high',
    ],
  },
  deepseek: {
    reasoningIOSetting: 'deepseek',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  xAI: {
    reasoningIOSetting: 'openai',
    defaultModels: ['grok-2', 'grok-3', 'grok-3-mini', 'grok-3-fast', 'grok-3-mini-fast'],
  },
  openRouter: {
    reasoningIOSetting: 'none',
    defaultModels: [
      'anthropic/claude-opus-4',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3.7-sonnet',
      'deepseek/deepseek-r1',
    ],
  },
  groq: {
    reasoningIOSetting: 'none',
    defaultModels: ['qwen-qwq-32b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  mistral: {
    reasoningIOSetting: 'none',
    defaultModels: ['codestral-latest', 'devstral-small-latest', 'mistral-large-latest'],
  },
  ollama: {
    reasoningIOSetting: 'none',
    defaultModels: [],
  },
  openAICompatible: {
    reasoningIOSetting: 'none',
    defaultModels: [],
  },
};

// ─── MODEL CAPABILITY MAP ───────────────────────────────────

/** Default capabilities for unrecognized models */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsStreaming: true,
  supportsImages: false,
  supportsJson: true,
  supportsPrefill: false,
  supportsFim: false,
  supportsTools: true,
  supportsReasoningTokens: false,
  maxContextTokens: 128_000,
  reservedOutputTokenSpace: 8_192,
  reasoningCapabilities: null,
};

/**
 * Model-specific capability overrides.
 * Keys are matched as substrings of the model name (case-insensitive).
 */
const MODEL_CAPABILITIES: Record<string, Partial<ModelCapabilities>> = {
  // ─── Anthropic ─────────────────
  'claude-opus-4': {
    supportsImages: true,
    supportsPrefill: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 16_384,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'budget_slider', min: 1024, max: 128_000, default: 10_000 },
      reasoningReservedOutputTokenSpace: 128_000,
    },
  },
  'claude-sonnet-4': {
    supportsImages: true,
    supportsPrefill: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 16_384,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'budget_slider', min: 1024, max: 128_000, default: 10_000 },
      reasoningReservedOutputTokenSpace: 128_000,
    },
  },
  'claude-3-7-sonnet': {
    supportsImages: true,
    supportsPrefill: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 16_384,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'budget_slider', min: 1024, max: 128_000, default: 10_000 },
      reasoningReservedOutputTokenSpace: 128_000,
    },
  },
  'claude-3-5-sonnet': {
    supportsImages: true,
    supportsPrefill: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 8_192,
  },
  'claude-3-5-haiku': {
    supportsImages: true,
    supportsPrefill: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 8_192,
  },
  'claude-3-opus': {
    supportsImages: true,
    supportsPrefill: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 4_096,
  },

  // ─── OpenAI ────────────────────
  'gpt-4.1': {
    supportsImages: true,
    maxContextTokens: 1_047_576,
    reservedOutputTokenSpace: 32_768,
  },
  'gpt-4o': {
    supportsImages: true,
    maxContextTokens: 128_000,
    reservedOutputTokenSpace: 16_384,
  },
  'o1': {
    supportsStreaming: false,
    supportsImages: false,
    supportsJson: false,
    supportsTools: false,
    supportsReasoningTokens: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 100_000,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: false,
      reasoningSlider: { type: 'effort_slider', options: ['low', 'medium', 'high'], default: 'high' },
      reasoningReservedOutputTokenSpace: 100_000,
    },
  },
  'o3': {
    supportsImages: true,
    supportsReasoningTokens: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 100_000,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: false,
      reasoningSlider: { type: 'effort_slider', options: ['low', 'medium', 'high'], default: 'medium' },
      reasoningReservedOutputTokenSpace: 100_000,
    },
  },
  'o4-mini': {
    supportsImages: true,
    supportsReasoningTokens: true,
    maxContextTokens: 200_000,
    reservedOutputTokenSpace: 100_000,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: false,
      reasoningSlider: { type: 'effort_slider', options: ['low', 'medium', 'high'], default: 'medium' },
      reasoningReservedOutputTokenSpace: 100_000,
    },
  },

  // ─── Gemini ────────────────────
  'gemini-2.5-pro': {
    supportsImages: true,
    maxContextTokens: 1_048_576,
    reservedOutputTokenSpace: 65_536,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'budget_slider', min: 0, max: 24_576, default: 8_192 },
      reasoningReservedOutputTokenSpace: 65_536,
    },
  },
  'gemini-2.5-flash': {
    supportsImages: true,
    maxContextTokens: 1_048_576,
    reservedOutputTokenSpace: 65_536,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'budget_slider', min: 0, max: 24_576, default: 4_096 },
      reasoningReservedOutputTokenSpace: 65_536,
    },
  },
  'gemini-2.0-flash': {
    supportsImages: true,
    maxContextTokens: 1_048_576,
    reservedOutputTokenSpace: 8_192,
  },
  'gemini-3': {
    supportsImages: true,
    maxContextTokens: 1_048_576,
    reservedOutputTokenSpace: 65_536,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'budget_slider', min: 0, max: 32_768, default: 8_192 },
      reasoningReservedOutputTokenSpace: 65_536,
    },
  },

  // ─── DeepSeek ──────────────────
  'deepseek-reasoner': {
    supportsReasoningTokens: true,
    maxContextTokens: 64_000,
    reservedOutputTokenSpace: 8_192,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: false,
      reasoningSlider: null,
      reasoningReservedOutputTokenSpace: 8_192,
    },
  },
  'deepseek-chat': {
    maxContextTokens: 64_000,
    reservedOutputTokenSpace: 8_192,
  },

  // ─── xAI ───────────────────────
  'grok-3': {
    supportsImages: true,
    maxContextTokens: 131_072,
    reservedOutputTokenSpace: 16_384,
    reasoningCapabilities: {
      supportsReasoning: true,
      canTurnOffReasoning: true,
      reasoningSlider: { type: 'effort_slider', options: ['low', 'high'], default: 'high' },
      reasoningReservedOutputTokenSpace: 16_384,
    },
  },

  // ─── Mistral ───────────────────
  'codestral': {
    supportsFim: true,
    maxContextTokens: 32_000,
    reservedOutputTokenSpace: 8_192,
  },
  'devstral': {
    supportsFim: true,
    supportsTools: true,
    maxContextTokens: 128_000,
    reservedOutputTokenSpace: 8_192,
  },
};

// ─── CORE FUNCTIONS ─────────────────────────────────────────

/**
 * Get capabilities for a specific model.
 * Matches model name as substring (case-insensitive) against known models.
 */
export function getModelCapabilities(modelName: string): ModelCapabilities {
  const lower = modelName.toLowerCase();
  let caps: ModelCapabilities = { ...DEFAULT_CAPABILITIES };

  // Find matching capability entries (longest match wins for specificity)
  let bestMatchLen = 0;
  let bestMatch: Partial<ModelCapabilities> | null = null;

  for (const [key, modelCaps] of Object.entries(MODEL_CAPABILITIES)) {
    if (lower.includes(key.toLowerCase()) && key.length > bestMatchLen) {
      bestMatchLen = key.length;
      bestMatch = modelCaps;
    }
  }

  if (bestMatch) {
    caps = { ...caps, ...bestMatch };
  }

  return caps;
}

/**
 * Auto-detect provider from model name.
 */
export function detectProvider(modelName: string): ProviderName | null {
  const lower = modelName.toLowerCase();

  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gpt-') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) return 'openAI';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('grok')) return 'xAI';
  if (lower.includes('llama') || lower.includes('qwen')) return 'groq';
  if (lower.includes('codestral') || lower.includes('mistral') || lower.includes('devstral')) return 'mistral';
  if (lower.includes('/')) return 'openRouter'; // "provider/model" format

  return null;
}

/**
 * Get provider-specific reasoning IO setting.
 * Used when constructing LLM messages to set reasoning parameters correctly.
 */
export function getProviderReasoningIO(providerName: ProviderName): ProviderReasoningIOSetting {
  return PROVIDER_CAPABILITIES[providerName]?.reasoningIOSetting ?? 'none';
}

/**
 * Get sendable reasoning info for a model.
 * Simplifies reasoning state into something that can be directly used
 * when constructing API calls.
 */
export function getSendableReasoningInfo(
  providerName: ProviderName,
  modelName: string,
  opts?: { reasoningEnabled?: boolean; reasoningBudget?: number; reasoningEffort?: string },
): SendableReasoningInfo {
  const caps = getModelCapabilities(modelName);
  if (!caps.reasoningCapabilities?.supportsReasoning) return null;

  const isEnabled = opts?.reasoningEnabled ?? true;
  if (!isEnabled) return null;

  const slider = caps.reasoningCapabilities.reasoningSlider;
  if (!slider) return null;

  if (slider.type === 'budget_slider') {
    const budget = opts?.reasoningBudget ?? slider.default;
    return { type: 'budget_slider_value', isReasoningEnabled: true, reasoningBudget: budget };
  }

  if (slider.type === 'effort_slider') {
    const effort = opts?.reasoningEffort ?? slider.default;
    return { type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: effort };
  }

  return null;
}

/**
 * Get reserved output token space for a model.
 * If reasoning is enabled and model supports it, returns the larger reasoning-specific space.
 */
export function getReservedOutputTokenSpace(
  modelName: string,
  isReasoningEnabled: boolean = false,
): number {
  const caps = getModelCapabilities(modelName);
  if (isReasoningEnabled && caps.reasoningCapabilities) {
    return caps.reasoningCapabilities.reasoningReservedOutputTokenSpace;
  }
  return caps.reservedOutputTokenSpace;
}
