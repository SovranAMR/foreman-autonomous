import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export interface ForemanConfig {
  telegram?: {
    botToken?: string;
    enabled?: boolean;
  };
  defaults?: {
    autoActivateTelegram?: boolean;
  };
}

const CONFIG_DIR = join(homedir(), ".foreman");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig(): ForemanConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(content) as ForemanConfig;
    }
  } catch (error) {
    console.warn(`Warning: Could not load config from ${CONFIG_PATH}:`, error);
  }
  return {};
}

export function saveConfig(config: ForemanConfig): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error: Could not save config to ${CONFIG_PATH}:`, error);
    throw error;
  }
}

export function getTelegramToken(): string | undefined {
  // 1. Check environment variable (highest priority)
  const envToken = process.env.FOREMAN_TELEGRAM_TOKEN;
  if (envToken) {
    return envToken;
  }

  // 2. Check config file
  const config = loadConfig();
  if (config.telegram?.botToken) {
    return config.telegram.botToken;
  }

  return undefined;
}

export function isTelegramEnabled(): boolean {
  // If token exists in env or config, it's enabled by default
  const token = getTelegramToken();
  if (!token) {
    return false;
  }

  // Check config for explicit enable/disable
  const config = loadConfig();
  return config.telegram?.enabled !== false; // default to true if not specified
}