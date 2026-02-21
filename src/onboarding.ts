/**
 * FOREMAN — Onboarding (First Run Setup)
 *
 * Interactive setup in the style of OpenClaw/Claude Code:
 * On first run → provider selection → OAuth or API key → save
 *
 * Provider options:
 * 1. Google Antigravity OAuth (recommended — free, Gemini + Claude + GPT)
 * 2. Anthropic API Key
 * 3. OpenAI API Key
 * 4. Google Gemini API Key
 */

import { createInterface } from "node:readline";
import { brand, icon, grad } from "./theme.js";
import { loginAntigravity } from "./antigravity-oauth.js";
import { saveCredentials, loadCredentials, type AntigravityCredentials } from "./antigravity-provider.js";
import { saveConfig, loadConfig, getApiKey, type ForemanConfig } from "./setup.js";
import { animateSparkRain } from "./animations.js";

// ─── READLINE ────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── PROVIDER CHECKS ─────────────────────────────────────────

export function hasAnyProvider(): boolean {
  const config = loadConfig();
  const creds = loadCredentials();

  if (creds && Date.now() < creds.expiresAt) return true;
  if (getApiKey("anthropic")) return true;
  if (getApiKey("openai")) return true;
  if (getApiKey("google")) return true;

  return false;
}

// ─── ONBOARDING ──────────────────────────────────────────────

export async function runOnboarding(): Promise<boolean> {
  console.log("");
  console.log(`    ${brand.gold("╔════════════════════════════════════════════════╗")}`);
  console.log(`    ${brand.gold("║")}                                                ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${brand.gold("⚒")}  ${grad.forge("FOREMAN — First Run Setup")}                  ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}                                                ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${brand.dim("To fire up the forge, you need an LLM")}        ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${brand.dim("provider. How would you like to connect?")}      ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}                                                ${brand.gold("║")}`);
  console.log(`    ${brand.gold("╚════════════════════════════════════════════════╝")}`);
  console.log("");

  // Provider options
  console.log(`    ${brand.gold("1.")} ${brand.bold("Google Antigravity")} ${brand.green("(recommended)")}`);
  console.log(`       ${brand.dim("OAuth sign-in — Gemini + Claude + GPT all in one account")}`);
  console.log(`       ${brand.dim("Free, no API key required")}`);
  console.log("");

  console.log(`    ${brand.cyan("2.")} ${brand.bold("Anthropic API Key")}`);
  console.log(`       ${brand.dim("Claude Opus, Sonnet, Haiku")}`);
  console.log(`       ${brand.dim("https://console.anthropic.com/settings/keys")}`);
  console.log("");

  console.log(`    ${brand.purple("3.")} ${brand.bold("OpenAI API Key")}`);
  console.log(`       ${brand.dim("GPT-4o, GPT-4o-mini")}`);
  console.log(`       ${brand.dim("https://platform.openai.com/api-keys")}`);
  console.log("");

  console.log(`    ${brand.green("4.")} ${brand.bold("Google Gemini API Key")}`);
  console.log(`       ${brand.dim("Gemini Pro, Flash")}`);
  console.log(`       ${brand.dim("https://aistudio.google.com/apikey")}`);
  console.log("");

  const choice = await prompt(`    ${brand.gold("Choice (1-4):")} `);

  switch (choice) {
    case "1":
      return await onboardAntigravity();
    case "2":
      return await onboardApiKey("anthropic", "ANTHROPIC_API_KEY", "sk-ant-");
    case "3":
      return await onboardApiKey("openai", "OPENAI_API_KEY", "sk-");
    case "4":
      return await onboardApiKey("google", "GOOGLE_API_KEY", "AIza");
    default:
      console.log(`    ${icon.warn} ${brand.dim("Invalid choice. Enter a number between 1-4.")}`);
      return false;
  }
}

// ─── ANTIGRAVITY OAUTH ───────────────────────────────────────

async function onboardAntigravity(): Promise<boolean> {
  console.log("");
  console.log(`    ${brand.gold("⚒")} ${brand.bold("Google Antigravity OAuth")}`);
  console.log(`    ${brand.dim("You will sign in with your Google account in the browser.")}`);
  console.log("");

  try {
    const creds = await loginAntigravity();
    saveCredentials(creds);

    if (process.stdout.isTTY) {
      await animateSparkRain(40, 600, 100);
    }

    console.log("");
    console.log(`    ${icon.done} ${brand.green("Setup complete!")}`);
    console.log(`    ${brand.dim("You can now use Gemini, Claude, and GPT models.")}`);
    console.log("");
    return true;
  } catch (err: any) {
    console.log(`    ${icon.fail} ${brand.red(err.message)}`);
    console.log(`    ${brand.dim("To try again:")} ${brand.cyan("foreman login")}`);
    return false;
  }
}

// ─── API KEY ─────────────────────────────────────────────────

async function onboardApiKey(
  provider: "anthropic" | "openai" | "google",
  envVar: string,
  expectedPrefix: string,
): Promise<boolean> {
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google Gemini",
  };

  console.log("");
  console.log(`    ${brand.gold("⚒")} ${brand.bold(labels[provider])} API Key`);
  console.log(`    ${brand.dim(`Can also be set as ${envVar} env var.`)}`);
  console.log("");

  const key = await prompt(`    ${brand.cyan("API Key:")} `);

  if (!key) {
    console.log(`    ${brand.dim("Skipped.")}`);
    return false;
  }

  if (expectedPrefix && !key.startsWith(expectedPrefix)) {
    console.log(`    ${icon.warn} ${brand.dim(`Key should start with "${expectedPrefix}". Saving anyway...`)}`);
  }

  // Save to config
  const config = loadConfig();
  if (provider === "anthropic") config.anthropic_api_key = key;
  else if (provider === "openai") config.openai_api_key = key;
  else if (provider === "google") config.google_api_key = key;
  config.default_provider = provider;
  saveConfig(config);

  if (process.stdout.isTTY) {
    await animateSparkRain(40, 400, 100);
  }

  console.log("");
  console.log(`    ${icon.done} ${brand.green(`${labels[provider]} key saved!`)}`);
  console.log("");
  return true;
}
