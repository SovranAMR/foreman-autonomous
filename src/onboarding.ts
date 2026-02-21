/**
 * FOREMAN — Onboarding (İlk Çalıştırma Kurulumu)
 *
 * OpenClaw/Claude Code tarzı interaktif kurulum:
 * İlk çalıştırmada provider seçimi → OAuth veya API key → kaydet
 *
 * Provider seçenekleri:
 * 1. Google Antigravity OAuth (önerilen — ücretsiz, Gemini + Claude + GPT)
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
  console.log(`    ${brand.gold("║")}  ${brand.gold("⚒")}  ${grad.forge("FOREMAN — İlk Kurulum")}                      ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}                                                ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${brand.dim("Forge'u ateşlemek için bir LLM provider")}        ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${brand.dim("gerekiyor. Nasıl bağlanmak istersin?")}          ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}                                                ${brand.gold("║")}`);
  console.log(`    ${brand.gold("╚════════════════════════════════════════════════╝")}`);
  console.log("");

  // Provider seçenekleri
  console.log(`    ${brand.gold("1.")} ${brand.bold("Google Antigravity")} ${brand.green("(önerilen)")}`);
  console.log(`       ${brand.dim("OAuth ile giriş — Gemini + Claude + GPT hepsi tek hesap")}`);
  console.log(`       ${brand.dim("Ücretsiz, API key gerekmez")}`);
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

  const choice = await prompt(`    ${brand.gold("Seçim (1-4):")} `);

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
      console.log(`    ${icon.warn} ${brand.dim("Geçersiz seçim. 1-4 arası bir sayı girin.")}`);
      return false;
  }
}

// ─── ANTIGRAVITY OAUTH ───────────────────────────────────────

async function onboardAntigravity(): Promise<boolean> {
  console.log("");
  console.log(`    ${brand.gold("⚒")} ${brand.bold("Google Antigravity OAuth")}`);
  console.log(`    ${brand.dim("Tarayıcıda Google hesabınızla giriş yapacaksınız.")}`);
  console.log("");

  try {
    const creds = await loginAntigravity();
    saveCredentials(creds);

    if (process.stdout.isTTY) {
      await animateSparkRain(40, 600, 100);
    }

    console.log("");
    console.log(`    ${icon.done} ${brand.green("Kurulum tamamlandı!")}`);
    console.log(`    ${brand.dim("Artık Gemini, Claude ve GPT modellerini kullanabilirsiniz.")}`);
    console.log("");
    return true;
  } catch (err: any) {
    console.log(`    ${icon.fail} ${brand.red(err.message)}`);
    console.log(`    ${brand.dim("Tekrar denemek için:")} ${brand.cyan("foreman login")}`);
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
  console.log(`    ${brand.dim(`${envVar} env var olarak da ayarlanabilir.`)}`);
  console.log("");

  const key = await prompt(`    ${brand.cyan("API Key:")} `);

  if (!key) {
    console.log(`    ${brand.dim("Atlandı.")}`);
    return false;
  }

  if (expectedPrefix && !key.startsWith(expectedPrefix)) {
    console.log(`    ${icon.warn} ${brand.dim(`Key "${expectedPrefix}" ile başlamalı. Yine de kaydediliyor...`)}`);
  }

  // Config'e kaydet
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
  console.log(`    ${icon.done} ${brand.green(`${labels[provider]} key kaydedildi!`)}`);
  console.log("");
  return true;
}
