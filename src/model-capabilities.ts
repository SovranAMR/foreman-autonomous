export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsJson: boolean;
  supportsPrefill: boolean;
  supportsFim: boolean;
  supportsAutocompleteSlow: boolean;
  supportsAutocompleteMulti: boolean;
  supportsReasoningTokens: boolean;
}

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsStreaming: true,
  supportsImages: false,
  supportsJson: false,
  supportsPrefill: false,
  supportsFim: false,
  supportsAutocompleteSlow: false,
  supportsAutocompleteMulti: false,
  supportsReasoningTokens: false,
};

export const MODEL_CAPABILITY_MAP: Record<string, Partial<ModelCapabilities>> = {
  'claude-3': {
    supportsImages: true,
    supportsJson: true,
    supportsPrefill: true,
  },
  'gpt-4': {
    supportsImages: true,
    supportsJson: true,
  },
  'o1': {
    supportsStreaming: false,
    supportsImages: false,
    supportsJson: false,
    supportsReasoningTokens: true,
  },
  'o3': {
    supportsReasoningTokens: true,
  }
};

export function getModelCapabilities(modelName: string): ModelCapabilities {
  const normalizedModelName = modelName.toLowerCase();
  
  let caps: ModelCapabilities = { ...DEFAULT_CAPABILITIES };

  for (const [key, modelCaps] of Object.entries(MODEL_CAPABILITY_MAP)) {
    if (normalizedModelName.includes(key.toLowerCase())) {
      caps = { ...caps, ...modelCaps };
    }
  }

  return caps;
}