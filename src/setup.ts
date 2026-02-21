/**
 * FOREMAN — Setup (API Key Configuration)
 *
 * Interactive API key setup.
 * Saves keys to ~/.foreman/config.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { brand, icon, grad, printLogo } from "./theme.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { GeminiProvider } from "./gemini-provider.js";

// ─── CONFIG PATH ─────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".foreman");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface ForemanConfig {
  anthropic_api_key?: string;
  openai_api_key?: string;
  google_api_key?: string;
  default_provider?: "anthropic" | "openai" | "google";
}

// ─── CONFIG OPS ──────────────────────────────────────────────

export function loadConfig(): ForemanConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: ForemanConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Returns API key from env var or config file.
 */
export function getApiKey(provider: "anthropic" | "openai" | "google"): string | undefined {
  // Env var takes priority
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ?? loadConfig().anthropic_api_key;
  }
  if (provider === "google") {
    return process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? loadConfig().google_api_key;
  }
  return process.env.OPENAI_API_KEY ?? loadConfig().openai_api_key;
}

// ─── READLINE HELPER ─────────────────────────────────────────

function ask(question: string, hidden: boolean = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden) {
      // Mask input for API keys
      process.stdout.write(question);
      let input = "";

      const originalWrite = process.stdout.write.bind(process.stdout);

      // Override stdin to not echo
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf-8");

      const onData = (char: string) => {
        if (char === "\n" || char === "\r") {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(input);
        } else if (char === "\u0003") {
          // Ctrl+C
          process.exit(0);
        } else if (char === "\u007F" || char === "\b") {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          input += char;
          process.stdout.write("•");
        }
      };

      process.stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

function askSimple(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── SETUP COMMAND ───────────────────────────────────────────

export async function runSetup(): Promise<void> {
  printLogo();

  console.log(brand.gold("  ◆ API Key Setup\n"));

  const config = loadConfig();

  // Show current status
  const hasAnthropic = !!(config.anthropic_api_key || process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = !!(config.openai_api_key || process.env.OPENAI_API_KEY);
  const hasGoogle = !!(config.google_api_key || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);

  console.log(`  Anthropic (Claude):  ${hasAnthropic ? icon.done + " Configured" : icon.pending + " Not configured"}`);
  console.log(`  OpenAI (GPT):        ${hasOpenAI ? icon.done + " Configured" : icon.pending + " Not configured"}`);
  console.log(`  Google (Gemini):     ${hasGoogle ? icon.done + " Configured" : icon.pending + " Not configured"}`);
  console.log("");

  // Anthropic
  console.log(brand.gold("  ─── Anthropic (Claude) ───"));
  console.log(brand.dim("  https://console.anthropic.com/settings/keys"));
  console.log("");

  const anthropicKey = await askSimple(`  ${brand.cyan("API Key")} (empty = skip): `);

  if (anthropicKey) {
    if (!anthropicKey.startsWith("sk-ant-")) {
      console.log(`  ${icon.warn} Key should start with "sk-ant-". Saving anyway...`);
    }
    // Validation — real API call
    process.stdout.write(`  ${brand.dim("Validating...")}`);
    try {
      const provider = new AnthropicProvider(anthropicKey);
      await provider.generate(
        [{ role: "user", content: "Say OK" }],
        { model: "claude-haiku", maxTokens: 5 },
      );
      process.stdout.write(`\r  ${icon.done} Anthropic key validated and saved\n`);
    } catch (err: any) {
      const msg = err?.message?.slice(0, 60) ?? "unknown error";
      process.stdout.write(`\r  ${icon.warn} Validation failed (${brand.dim(msg)}), saving anyway\n`);
    }
    config.anthropic_api_key = anthropicKey;
  } else {
    console.log(brand.dim("  Skipped"));
  }

  console.log("");

  // OpenAI
  console.log(brand.gold("  ─── OpenAI (GPT) ───"));
  console.log(brand.dim("  https://platform.openai.com/api-keys"));
  console.log("");

  const openaiKey = await askSimple(`  ${brand.cyan("API Key")} (empty = skip): `);

  if (openaiKey) {
    if (!openaiKey.startsWith("sk-")) {
      console.log(`  ${icon.warn} Key should start with "sk-". Saving anyway...`);
    }
    process.stdout.write(`  ${brand.dim("Validating...")}`);
    try {
      const provider = new OpenAIProvider(openaiKey);
      await provider.generate(
        [{ role: "user", content: "Say OK" }],
        { model: "gpt-4o-mini", maxTokens: 5 },
      );
      process.stdout.write(`\r  ${icon.done} OpenAI key validated and saved  \n`);
    } catch (err: any) {
      const msg = err?.message?.slice(0, 60) ?? "unknown error";
      process.stdout.write(`\r  ${icon.warn} Validation failed (${brand.dim(msg)}), saving anyway\n`);
    }
    config.openai_api_key = openaiKey;
  } else {
    console.log(brand.dim("  Skipped"));
  }

  console.log("");

  // Google / Gemini
  console.log(brand.gold("  ─── Google (Gemini) ───"));
  console.log(brand.dim("  https://aistudio.google.com/apikey"));
  console.log("");

  const googleKey = await askSimple(`  ${brand.cyan("API Key")} (empty = skip): `);

  if (googleKey) {
    process.stdout.write(`  ${brand.dim("Validating...")}`);
    try {
      const provider = new GeminiProvider(googleKey);
      await provider.generate(
        [{ role: "user", content: "Say OK" }],
        { model: "gemini-flash", maxTokens: 5 },
      );
      process.stdout.write(`\r  ${icon.done} Google key validated and saved  \n`);
    } catch (err: any) {
      const msg = err?.message?.slice(0, 60) ?? "unknown error";
      process.stdout.write(`\r  ${icon.warn} Validation failed (${brand.dim(msg)}), saving anyway\n`);
    }
    config.google_api_key = googleKey;
  } else {
    console.log(brand.dim("  Skipped"));
  }

  console.log("");

  // Default provider
  const providerCount = [config.anthropic_api_key, config.openai_api_key, config.google_api_key].filter(Boolean).length;
  if (providerCount >= 2) {
    const choices = [];
    if (config.anthropic_api_key) choices.push(`${brand.gold("1")}=Anthropic`);
    if (config.openai_api_key) choices.push(`${brand.cyan("2")}=OpenAI`);
    if (config.google_api_key) choices.push(`${brand.green("3")}=Google`);

    const defaultProv = await askSimple(
      `  ${brand.cyan("Default provider")} (${choices.join(", ")}): `
    );
    config.default_provider = defaultProv === "2" ? "openai" : defaultProv === "3" ? "google" : "anthropic";
    console.log(`  ${icon.done} Default: ${config.default_provider}`);
  } else if (config.anthropic_api_key) {
    config.default_provider = "anthropic";
  } else if (config.openai_api_key) {
    config.default_provider = "openai";
  } else if (config.google_api_key) {
    config.default_provider = "google";
  }

  // Save
  saveConfig(config);

  console.log("");
  console.log(brand.green("  ✅ Setup complete!"));
  console.log(brand.dim(`  Config: ${CONFIG_FILE}`));
  console.log("");
  console.log(`  Next step: ${brand.cyan("foreman init \"project-name\"")}`);
  console.log("");
}

// ─── STATUS CHECK ────────────────────────────────────────────

export function printProviderStatus(): void {
  const config = loadConfig();

  const anthropicKey = getApiKey("anthropic");
  const openaiKey = getApiKey("openai");
  const googleKey = getApiKey("google");

  if (anthropicKey) {
    const masked = anthropicKey.slice(0, 10) + "•".repeat(10) + anthropicKey.slice(-4);
    console.log(`  ${icon.done} Anthropic: ${brand.dim(masked)}`);
  } else {
    console.log(`  ${icon.pending} Anthropic: ${brand.dim("Not configured")}`);
  }

  if (openaiKey) {
    const masked = openaiKey.slice(0, 7) + "•".repeat(10) + openaiKey.slice(-4);
    console.log(`  ${icon.done} OpenAI:    ${brand.dim(masked)}`);
  } else {
    console.log(`  ${icon.pending} OpenAI:    ${brand.dim("Not configured")}`);
  }

  if (googleKey) {
    const masked = googleKey.slice(0, 6) + "•".repeat(10) + googleKey.slice(-4);
    console.log(`  ${icon.done} Google:    ${brand.dim(masked)}`);
  } else {
    console.log(`  ${icon.pending} Google:    ${brand.dim("Not configured")}`);
  }

  if (!anthropicKey && !openaiKey && !googleKey) {
    console.log("");
    console.log(`  ${icon.warn} No providers configured.`);
    console.log(`     Run ${brand.cyan("foreman setup")} to add an API key.`);
  }
}
