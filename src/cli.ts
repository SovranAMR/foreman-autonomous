#!/usr/bin/env npx tsx
/**
 * FOREMAN — CLI Entry Point
 *
 * Komutlar:
 *   foreman init <name>     — yeni proje oluştur
 *   foreman status          — mevcut durumu göster
 *   foreman run <task>      — görev çalıştır (düşünce zinciri)
 *   foreman history [n]     — son N geçişi göster
 *   foreman thoughts        — thought listesi
 *   foreman chains          — chain listesi
 */

import { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { StateManager } from "./state.js";
import { ThoughtManager } from "./thought-manager.js";
import { ChainManager } from "./chain-manager.js";
import { Engine } from "./engine.js";
import { MockProvider } from "./provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { Orchestrator } from "./orchestrator.js";

const program = new Command();

program
  .name("foreman")
  .description("AI agent orchestrator — atomic thought chains")
  .version("0.1.0");

// ─── INIT ─────────────────────────────────────────────────────

program
  .command("init <name>")
  .description("Yeni Foreman projesi oluştur")
  .option("-d, --dir <path>", "Proje dizini (varsayılan: mevcut dizin)")
  .action((name: string, opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());

    // state.json var mı kontrol
    if (existsSync(join(projectRoot, "state.json"))) {
      console.log("⚠️  Bu dizinde zaten bir Foreman projesi var.");
      console.log(`   ${projectRoot}/state.json`);
      return;
    }

    // Dizinleri oluştur
    for (const dir of ["thoughts", "chains", "projects"]) {
      mkdirSync(join(projectRoot, dir), { recursive: true });
    }

    // State oluştur
    const sm = StateManager.create(projectRoot, name);
    sm.save();

    console.log(`✅ Foreman projesi oluşturuldu: "${name}"`);
    console.log(`   📁 ${projectRoot}`);
    console.log(`   📄 state.json`);
    console.log(`   📁 thoughts/`);
    console.log(`   📁 chains/`);
    console.log("");
    console.log(`Sonraki adım: foreman run "görev tanımı"`);
  });

// ─── STATUS ───────────────────────────────────────────────────

program
  .command("status")
  .description("Mevcut proje durumunu göster")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = StateManager.load(projectRoot, false);

    if (!sm) {
      console.log("❌ Foreman projesi bulunamadı. Önce `foreman init <name>` çalıştırın.");
      return;
    }

    const snap = sm.snapshot();
    const thoughts = new ThoughtManager(projectRoot);
    const chains = new ChainManager(projectRoot);

    const allThoughts = thoughts.list();
    const allChains = chains.list();

    const doneCount = allThoughts.filter(t => t.status === "done").length;
    const pendingCount = allThoughts.filter(t => t.status === "pending").length;
    const blockedCount = allThoughts.filter(t => t.status === "blocked").length;

    console.log("┌─────────────────────────────────────────┐");
    console.log(`│  FOREMAN — ${snap.projectName.padEnd(29)}│`);
    console.log("├─────────────────────────────────────────┤");
    console.log(`│  State:    ${snap.currentState.padEnd(29)}│`);
    console.log(`│  Chains:   ${String(allChains.length).padEnd(29)}│`);
    console.log(`│  Thoughts: ${String(allThoughts.length).padEnd(29)}│`);
    console.log(`│    ✅ Done:    ${String(doneCount).padEnd(25)}│`);
    console.log(`│    ⏳ Pending: ${String(pendingCount).padEnd(25)}│`);
    console.log(`│    🚫 Blocked: ${String(blockedCount).padEnd(24)}│`);
    console.log(`│  Tokens:   ${String(snap.totalTokens).padEnd(29)}│`);
    console.log(`│  Session:  ${snap.sessionStartedAt.slice(0, 19).padEnd(29)}│`);
    console.log("└─────────────────────────────────────────┘");

    if (snap.activeChainId) {
      console.log(`\n🔗 Active chain: ${snap.activeChainId}`);
    }
    if (snap.activeThoughtId) {
      console.log(`💭 Active thought: ${snap.activeThoughtId}`);
    }
  });

// ─── HISTORY ──────────────────────────────────────────────────

program
  .command("history")
  .description("Son state geçişlerini göster")
  .option("-n, --count <n>", "Kaç geçiş gösterilsin", "10")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { count: string; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = StateManager.load(projectRoot, false);

    if (!sm) {
      console.log("❌ Foreman projesi bulunamadı.");
      return;
    }

    const history = sm.recentHistory(parseInt(opts.count));

    if (history.length === 0) {
      console.log("📭 Henüz geçiş yok.");
      return;
    }

    console.log("State Geçişleri:");
    console.log("─".repeat(60));
    for (const h of history) {
      const time = h.at.slice(11, 19);
      const arrow = `${h.from} → ${h.to}`;
      const ctx = [h.thoughtId, h.chainId].filter(Boolean).join(", ");
      console.log(`  ${time}  ${arrow.padEnd(30)} ${h.reason}`);
      if (ctx) console.log(`           ${ctx}`);
    }
  });

// ─── THOUGHTS ─────────────────────────────────────────────────

program
  .command("thoughts")
  .description("Thought listesini göster")
  .option("-c, --chain <id>", "Chain ID ile filtrele")
  .option("-s, --status <status>", "Status ile filtrele")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { chain?: string; status?: string; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new ThoughtManager(projectRoot);

    const filter: any = {};
    if (opts.chain) filter.chainId = opts.chain;
    if (opts.status) filter.status = opts.status;

    const list = tm.list(filter);

    if (list.length === 0) {
      console.log("📭 Thought bulunamadı.");
      return;
    }

    console.log(`Thoughts (${list.length}):`);
    console.log("─".repeat(70));
    for (const t of list) {
      const statusIcon = t.status === "done" ? "✅" : t.status === "blocked" ? "🚫" : "⏳";
      const conf = t.confidence > 0 ? ` (${(t.confidence * 100).toFixed(0)}%)` : "";
      console.log(`  ${statusIcon} ${t.id.padEnd(8)} [${t.layer.padEnd(11)}] ${t.input.slice(0, 45)}${conf}`);
    }
  });

// ─── CHAINS ───────────────────────────────────────────────────

program
  .command("chains")
  .description("Chain listesini göster")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const cm = new ChainManager(projectRoot);

    const list = cm.list();

    if (list.length === 0) {
      console.log("📭 Chain bulunamadı.");
      return;
    }

    console.log(`Chains (${list.length}):`);
    console.log("─".repeat(60));
    for (const c of list) {
      const statusIcon = c.status === "completed" ? "✅" : c.status === "blocked" ? "🚫" : "🔄";
      console.log(`  ${statusIcon} ${c.id.padEnd(25)} ${c.name}`);
      console.log(`     ${c.thoughts.length} thoughts | ${c.goal.slice(0, 40)}`);
    }
  });

// ─── RUN ──────────────────────────────────────────────────────

program
  .command("run <task>")
  .description("Bir görev çalıştır (düşünce zinciri başlat)")
  .option("-l, --layer <layer>", "Başlangıç katmanı", "visioner")
  .option("-m, --mock", "Mock provider kullan (gerçek API yerine)")
  .option("-d, --dir <path>", "Proje dizini")
  .action(async (task: string, opts: { layer: string; mock?: boolean; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());

    // Engine oluştur
    const engine = new Engine({
      projectRoot,
      projectName: "foreman",
    });

    // Provider'ları kaydet
    if (opts.mock) {
      const mock = new MockProvider("I need more context. Please clarify the task.");
      engine.providers.register({
        name: "mock",
        supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o", "gpt-4o-mini", "gemini-flash", "gemini-pro"],
        generate: mock.generate.bind(mock),
      });
      console.log("🔧 Mock provider aktif");
    } else {
      // Gerçek provider'lar — API key varsa kaydet
      try {
        const anthropic = new AnthropicProvider();
        engine.providers.register(anthropic);
        console.log("✅ Anthropic provider kayıtlı");
      } catch { /* API key yok, atla */ }

      try {
        const openai = new OpenAIProvider();
        engine.providers.register(openai);
        console.log("✅ OpenAI provider kayıtlı");
      } catch { /* API key yok, atla */ }

      if (engine.providers.size === 0) {
        console.error("❌ Hiçbir LLM provider bulunamadı.");
        console.error("   ANTHROPIC_API_KEY veya OPENAI_API_KEY env var ayarlayın.");
        console.error("   Veya --mock flag'ı ile mock provider kullanın.");
        process.exit(1);
      }
    }

    console.log(`🚀 Görev başlatıldı: "${task}"`);
    console.log("");

    // Orchestrator
    const orchestrator = new Orchestrator(engine);

    // Event logging
    orchestrator.on(event => {
      switch (event.type) {
        case "phase_start":
          console.log(`\n── ${event.phase.toUpperCase()} ──`);
          console.log(`   ${event.detail}`);
          break;
        case "thought_complete":
          console.log(`   💭 ${event.thought.id} [${event.thought.layer}] — confidence: ${(event.thought.confidence * 100).toFixed(0)}%`);
          break;
        case "block_detected":
          console.log(`   ⚠️  BLOCK: ${event.reason}`);
          break;
        case "reflection":
          console.log(`   🔄 Reflection (${event.atomCount} atoms): ${event.summary.slice(0, 100)}`);
          break;
        case "pipeline_complete":
          console.log(`\n${"═".repeat(50)}`);
          console.log(`✅ Pipeline tamamlandı`);
          console.log(`   Thoughts: ${event.totalThoughts}`);
          console.log(`   Tokens: ${event.totalTokens}`);
          break;
        case "error":
          console.error(`   ❌ ${event.message}`);
          break;
      }
    });

    try {
      const result = await orchestrator.run(task);
      if (!result.success) {
        console.log("\n⚠️  Pipeline tamamlanamadı (BLOCK durumu).");
        console.log("   `foreman status` ile durumu kontrol edin.");
      }
    } catch (err: any) {
      console.error(`\n❌ Hata: ${err.message}`);
      process.exit(1);
    }
  });

// ─── PARSE ────────────────────────────────────────────────────

program.parse();
