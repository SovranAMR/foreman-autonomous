#!/usr/bin/env npx tsx
/**
 * FOREMAN — CLI
 *
 * Kullanıcı Komutları (nihai kullanıcı bunları kullanır):
 *   foreman setup           — API key kurulumu (interaktif)
 *   foreman init <name>     — yeni proje oluştur
 *   foreman status          — mevcut durumu göster (memory/session/cache dahil)
 *   foreman run <task>      — görev çalıştır (tam pipeline — session/memory/cache otomatik)
 *   foreman task add        — yeni görev ekle
 *   foreman task list       — görev listesi
 *   foreman task show <id>  — görev detayı
 *   foreman task done <id>  — görevi tamamla
 *   foreman board           — kanban board görünümü
 *   foreman doctor          — sistem sağlık kontrolü
 *
 * Geliştirici Komutları (debug/inspect — normal kullanıcı görmez):
 *   foreman internals thoughts    — thought listesi
 *   foreman internals chains      — chain listesi
 *   foreman internals history     — state geçiş tarihi
 *   foreman internals memory      — memory listesi
 *   foreman internals sessions    — session listesi
 *   foreman internals cache       — cache istatistikleri
 *   foreman internals providers   — provider durumu
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
import { GeminiProvider } from "./gemini-provider.js";
import { Orchestrator } from "./orchestrator.js";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import {
  brand, icon, grad, printLogo, printForgeIntro, printForgeBanner,
  phaseHeader, thoughtLine, blockLine,
  reflectionLine, completionBox, statusBox,
  forgeDivider, thoughtSpark, forgeProgress,
  doctorHeader, doctorItem, doctorFooter,
  printIdleForge,
} from "./theme.js";
import { runSetup, getApiKey, printProviderStatus } from "./setup.js";
import { TaskManager } from "./task-manager.js";
import { ProjectManager } from "./project-manager.js";
import { MemoryManager } from "./memory-manager.js";
import { SessionManager } from "./session-manager.js";
import { CacheManager } from "./cache-manager.js";
import type { TaskPriority, TaskType } from "./types.js";

const program = new Command();

program
  .name("foreman")
  .description(grad.logo("AI Agent Orchestrator — Atomic Thought Chains"))
  .version("0.1.0");

// ─── SETUP ────────────────────────────────────────────────────

program
  .command("setup")
  .description("API key kurulumu (Anthropic / OpenAI)")
  .action(async () => {
    await runSetup();
  });

// ─── DOCTOR ───────────────────────────────────────────────────

program
  .command("doctor")
  .description("Sistem sağlık kontrolü")
  .action(() => {
    printLogo();
    doctorHeader();

    let allOk = true;

    // Node.js
    const nodeVer = process.version;
    const nodeMajor = parseInt(nodeVer.slice(1).split(".")[0]);
    const nodeOk = nodeMajor >= 20;
    if (!nodeOk) allOk = false;
    doctorItem(nodeOk, `Node.js ${nodeVer}`, nodeOk ? undefined : "20+ gerekli");

    // npm
    try {
      const npmVer = execSync("npm -v", { encoding: "utf-8" }).trim();
      doctorItem(true, `npm ${npmVer}`);
    } catch {
      doctorItem(false, "npm bulunamadı");
      allOk = false;
    }

    // Providers
    console.log("");
    printProviderStatus();

    // Config
    console.log("");
    const configDir = join(homedir(), ".foreman");
    const configExists = existsSync(configDir);
    doctorItem(configExists, `Config dizini`, configDir);
    if (!configExists) allOk = false;

    doctorFooter(allOk);
  });

// ─── INIT ─────────────────────────────────────────────────────

program
  .command("init <name>")
  .description("Yeni Foreman projesi oluştur")
  .option("-d, --dir <path>", "Proje dizini (varsayılan: mevcut dizin)")
  .action((name: string, opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());

    printLogo();

    if (existsSync(join(projectRoot, "state.json"))) {
      console.log(`  ${icon.warn} Bu dizinde zaten bir Foreman projesi var.`);
      console.log(brand.dim(`     ${projectRoot}/state.json`));
      return;
    }

    for (const dir of ["thoughts", "chains", "projects"]) {
      mkdirSync(join(projectRoot, dir), { recursive: true });
    }

    const sm = StateManager.create(projectRoot, name);
    sm.save();

    console.log(`  ${icon.done} ${brand.gold("Proje oluşturuldu:")} ${brand.bold(name)}`);
    console.log("");
    console.log(`     📁 ${brand.dim(projectRoot)}`);
    console.log(`     📄 state.json`);
    console.log(`     📁 thoughts/`);
    console.log(`     📁 chains/`);
    console.log("");
    console.log(`  Sonraki: ${brand.cyan(`foreman run "${name} için görev"`)}`);
    console.log("");
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
      printLogo();
      printIdleForge();
      console.log(`    ${icon.fail} Foreman projesi bulunamadı.`);
      console.log(`    ${brand.dim("Önce:")} ${brand.cyan("foreman init <name>")}`);
      return;
    }

    const snap = sm.snapshot();
    const thoughts = new ThoughtManager(projectRoot);
    const chains = new ChainManager(projectRoot);
    const allThoughts = thoughts.list();

    statusBox({
      name: snap.projectName,
      state: snap.currentState,
      chains: chains.list().length,
      thoughts: allThoughts.length,
      done: allThoughts.filter(t => t.status === "done").length,
      pending: allThoughts.filter(t => t.status === "pending").length,
      blocked: allThoughts.filter(t => t.status === "blocked").length,
      tokens: snap.totalTokens,
      session: snap.sessionStartedAt,
      activeChain: snap.activeChainId,
      activeThought: snap.activeThoughtId,
    });

    // Memory özeti
    const mm = new MemoryManager(projectRoot);
    const memStats = mm.stats();
    if (memStats.total > 0) {
      console.log(brand.gold("  ◆ Memory"));
      console.log(`     🔥 ${memStats.hotCount} hot  📌 ${memStats.warmCount} warm  📝 ${memStats.coldCount} cold  (${memStats.total} total)`);
    }

    // Session özeti
    const sesm = new SessionManager(projectRoot);
    const activeSession = sesm.getActive();
    const allSessions = sesm.list();
    if (allSessions.length > 0) {
      console.log(brand.gold("  ◆ Sessions"));
      if (activeSession) {
        console.log(`     ${brand.green("●")} Aktif: ${brand.bold(activeSession.id)} (${activeSession.thoughtIds.length} thoughts, ${activeSession.totalTokens} tokens)`);
      }
      console.log(`     ${allSessions.length} total session`);
    }

    // Cache özeti
    const cm = new CacheManager(projectRoot);
    const cacheStats = cm.stats();
    if (cacheStats.entries > 0 || cacheStats.totalHits > 0) {
      console.log(brand.gold("  ◆ Cache"));
      console.log(`     ${cacheStats.entries} entries, ${cacheStats.totalHits} hits, ${brand.green(String(cacheStats.totalTokensSaved))} tokens saved`);
    }

    console.log("");
  });

// ─── RUN ──────────────────────────────────────────────────────

program
  .command("run <task>")
  .description("Görev çalıştır (tam pipeline)")
  .option("-m, --mock", "Mock provider kullan (test)")
  .option("-d, --dir <path>", "Proje dizini")
  .action(async (task: string, opts: { mock?: boolean; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());

    printForgeIntro();

    const engine = new Engine({
      projectRoot,
      projectName: "foreman",
    });

    // Provider'ları kaydet
    if (opts.mock) {
      const mock = new MockProvider("I need more context. Please clarify the task.");
      engine.providers.register({
        name: "mock",
        supportedModels: ["mock-model", "claude-opus", "claude-sonnet", "gpt-4o", "gpt-4o-mini", "gemini-flash", "gemini-pro", "gemini-ultra"],
        generate: mock.generate.bind(mock),
      });
      console.log(`  ${icon.warn} ${brand.gold("Mock provider aktif")}\n`);
    } else {
      // Config'den veya env var'dan key al
      const anthropicKey = getApiKey("anthropic");
      const openaiKey = getApiKey("openai");

      if (anthropicKey) {
        try {
          const anthropic = new AnthropicProvider(anthropicKey);
          engine.providers.register(anthropic);
          console.log(`  ${icon.done} Anthropic ${brand.dim("(Claude)")}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} Anthropic: ${brand.dim(e.message)}`);
        }
      }

      if (openaiKey) {
        try {
          const openai = new OpenAIProvider(openaiKey);
          engine.providers.register(openai);
          console.log(`  ${icon.done} OpenAI ${brand.dim("(GPT)")}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} OpenAI: ${brand.dim(e.message)}`);
        }
      }

      const googleKey = getApiKey("google");
      if (googleKey) {
        try {
          const gemini = new GeminiProvider(googleKey);
          engine.providers.register(gemini);
          console.log(`  ${icon.done} Google ${brand.dim("(Gemini)")}`);
        } catch (e: any) {
          console.log(`  ${icon.fail} Google: ${brand.dim(e.message)}`);
        }
      }

      if (engine.providers.size === 0) {
        console.log("");
        console.log(`  ${icon.fail} ${brand.red("Hiçbir LLM provider bulunamadı.")}`);
        console.log(`     ${brand.cyan("foreman setup")} çalıştırarak API key ekleyin.`);
        console.log(`     veya ${brand.dim("--mock")} flag'ı ile test edin.`);
        process.exit(1);
      }
      console.log("");
    }

    printForgeBanner(task);

    // Orchestrator
    const orchestrator = new Orchestrator(engine);

    orchestrator.on(event => {
      switch (event.type) {
        case "phase_start":
          phaseHeader(event.phase, event.detail);
          break;
        case "thought_complete":
          thoughtLine(
            event.thought.id,
            event.thought.layer,
            event.thought.confidence,
            event.thought.tokenCost,
          );
          thoughtSpark(event.thought.id, event.thought.confidence);
          break;
        case "block_detected":
          blockLine(event.reason);
          break;
        case "reflection":
          reflectionLine(event.atomCount, event.summary);
          break;
        case "pipeline_complete":
          completionBox(event.totalThoughts, event.totalTokens, true);
          break;
        case "error":
          console.log(`  ${icon.fail} ${brand.red(event.message)}`);
          break;
      }
    });

    try {
      const result = await orchestrator.run(task);
      if (!result.success) {
        completionBox(result.totalThoughts, result.totalTokens, false);
        console.log(`  ${brand.dim("foreman status")} ile durumu kontrol edin.`);
      }
    } catch (err: any) {
      console.log("");
      console.log(`  ${icon.fail} ${brand.red(err.message)}`);
      process.exit(1);
    }
    console.log("");
  });

// ─── TASKS ────────────────────────────────────────────────────

const taskCmd = program
  .command("task")
  .description("Görev yönetimi");

taskCmd
  .command("add <title>")
  .description("Yeni görev ekle")
  .option("-d, --dir <path>", "Proje dizini")
  .option("-p, --priority <p>", "Öncelik (critical/high/medium/low)", "medium")
  .option("-t, --type <t>", "Tip (feature/bug/research/design/refactor/test/docs/idea)", "feature")
  .option("--depends <ids>", "Bağımlılıklar (virgülle ayrılmış)")
  .option("--tags <tags>", "Etiketler (virgülle ayrılmış)")
  .option("--effort <n>", "Effort (1-8)")
  .option("--desc <text>", "Açıklama")
  .option("--parent <id>", "Üst görev ID")
  .action((title: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    const pm = new ProjectManager(projectRoot);

    // İlk projeyi bul
    const projects = pm.list();
    const projectId = projects[0]?.id ?? "proj_001";

    const task = tm.create({
      projectId,
      title,
      description: opts.desc ?? title,
      type: (opts.type ?? "feature") as TaskType,
      priority: (opts.priority ?? "medium") as TaskPriority,
      dependsOn: opts.depends?.split(",").map((s: string) => s.trim()) ?? [],
      tags: opts.tags?.split(",").map((s: string) => s.trim()) ?? [],
      effort: opts.effort ? parseInt(opts.effort) : undefined,
      parentTaskId: opts.parent,
    });

    // Projeye bağla
    if (projects[0]) {
      pm.addTask(projectId, task.id);
    }

    console.log(`  ${icon.done} ${brand.bold(task.id)} ${brand.gold(title)}`);
    console.log(`     ${brand.dim(`priority: ${task.priority} | type: ${task.type} | effort: ${task.effort ?? "—"}`)}`);
    if (task.dependsOn.length > 0) {
      console.log(`     ${brand.dim(`depends: ${task.dependsOn.join(", ")}`)}`);
    }
    console.log("");
  });

taskCmd
  .command("list")
  .alias("ls")
  .description("Görev listesi")
  .option("-d, --dir <path>", "Proje dizini")
  .option("-s, --status <s>", "Status filtresi")
  .option("-p, --priority <p>", "Öncelik filtresi")
  .option("-t, --tag <tag>", "Etiket filtresi")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);

    const filter: any = {};
    if (opts.status) filter.status = opts.status;
    if (opts.priority) filter.priority = opts.priority;
    if (opts.tag) filter.tag = opts.tag;

    const list = tm.list(filter);

    if (list.length === 0) {
      console.log(`  ${icon.pending} Görev bulunamadı.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Görevler (${list.length})\n`));

    const prioIcon: Record<string, string> = {
      critical: brand.red("▲▲"),
      high: brand.gold("▲ "),
      medium: brand.cyan("● "),
      low: brand.dim("○ "),
    };

    const statusIcon: Record<string, string> = {
      backlog: brand.dim("□"),
      ready: brand.cyan("◇"),
      in_progress: brand.gold("◉"),
      review: brand.purple("◈"),
      done: icon.done,
      blocked: icon.block,
      cancelled: brand.dim("✕"),
    };

    for (const t of list) {
      const si = statusIcon[t.status] ?? "•";
      const pi = prioIcon[t.priority] ?? "  ";
      const tags = t.tags.length > 0 ? brand.dim(` [${t.tags.join(", ")}]`) : "";
      const effort = t.effort ? brand.dim(` (${t.effort}pt)`) : "";
      const deps = t.dependsOn.length > 0 ? brand.dim(` ← ${t.dependsOn.join(",")}`) : "";

      console.log(
        `  ${si} ${pi} ${brand.bold(t.id.padEnd(10))} ${t.title}${effort}${tags}${deps}`
      );

      if (t.subtaskIds.length > 0) {
        for (const subId of t.subtaskIds) {
          const sub = tm.get(subId);
          if (sub) {
            const subSi = statusIcon[sub.status] ?? "•";
            console.log(`     ${brand.dim("└")} ${subSi} ${brand.dim(sub.id.padEnd(10))} ${brand.dim(sub.title)}`);
          }
        }
      }
    }
    console.log("");
  });

taskCmd
  .command("show <id>")
  .description("Görev detayı")
  .option("-d, --dir <path>", "Proje dizini")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);

    const task = tm.get(id);
    if (!task) {
      console.log(`  ${icon.fail} Görev bulunamadı: ${id}`);
      return;
    }

    const w = 50;
    console.log("");
    console.log(brand.gold(`  ╭${"─".repeat(w)}╮`));
    console.log(brand.gold(`  │`) + ` ${brand.bold(task.id)} — ${task.title}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  ├${"─".repeat(w)}┤`));
    console.log(brand.gold(`  │`) + `  Status:   ${task.status}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Priority: ${task.priority}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Type:     ${task.type}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Effort:   ${task.effort ?? "—"}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  │`) + `  Tokens:   ${task.totalTokens}`.padEnd(w) + brand.gold(`│`));
    console.log(brand.gold(`  ╰${"─".repeat(w)}╯`));

    if (task.description !== task.title) {
      console.log(`\n  ${brand.dim("Açıklama:")} ${task.description}`);
    }
    if (task.dependsOn.length > 0) {
      console.log(`  ${brand.dim("Bağımlılıklar:")} ${task.dependsOn.join(", ")}`);
    }
    if (task.tags.length > 0) {
      console.log(`  ${brand.dim("Etiketler:")} ${task.tags.join(", ")}`);
    }
    if (task.acceptanceCriteria.length > 0) {
      console.log(`  ${brand.dim("Kabul Kriterleri:")}`);
      for (const c of task.acceptanceCriteria) {
        console.log(`     ${brand.dim("•")} ${c}`);
      }
    }
    if (task.chainIds.length > 0) {
      console.log(`  ${brand.dim("Chain'ler:")} ${task.chainIds.join(", ")}`);
    }
    if (task.notes.length > 0) {
      console.log(`  ${brand.dim("Notlar:")}`);
      for (const n of task.notes) {
        console.log(`     ${brand.dim(n)}`);
      }
    }
    if (task.blockedReason) {
      console.log(`  ${icon.block} ${brand.red(task.blockedReason)}`);
    }
    console.log("");
  });

taskCmd
  .command("done <id>")
  .description("Görevi tamamla")
  .option("-d, --dir <path>", "Proje dizini")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    const task = tm.update(id, { status: "done" });
    console.log(`  ${icon.done} ${brand.bold(task.id)} ${brand.green("tamamlandı")}`);
  });

taskCmd
  .command("block <id>")
  .description("Görevi blokla")
  .option("-d, --dir <path>", "Proje dizini")
  .option("-r, --reason <text>", "Bloklama sebebi")
  .action((id: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    const task = tm.update(id, { status: "blocked", blockedReason: opts.reason ?? "Blocked" });
    console.log(`  ${icon.block} ${brand.bold(task.id)} ${brand.red("bloklandı")}: ${opts.reason ?? ""}`);
  });

taskCmd
  .command("note <id> <text>")
  .description("Göreve not ekle")
  .option("-d, --dir <path>", "Proje dizini")
  .action((id: string, text: string, opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);
    tm.addNote(id, text);
    console.log(`  ${icon.done} Not eklendi → ${brand.bold(id)}`);
  });

// ─── BOARD (Kanban) ───────────────────────────────────────────

program
  .command("board")
  .description("Kanban board görünümü")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new TaskManager(projectRoot);

    const all = tm.list();
    if (all.length === 0) {
      console.log(`  ${icon.pending} Görev bulunamadı.`);
      return;
    }

    const columns: Record<string, typeof all> = {
      "📋 BACKLOG": [],
      "🔵 READY": [],
      "🟡 IN PROGRESS": [],
      "🟣 REVIEW": [],
      "✅ DONE": [],
      "🚫 BLOCKED": [],
    };

    const colMap: Record<string, string> = {
      backlog: "📋 BACKLOG",
      ready: "🔵 READY",
      in_progress: "🟡 IN PROGRESS",
      review: "🟣 REVIEW",
      done: "✅ DONE",
      blocked: "🚫 BLOCKED",
      cancelled: "✅ DONE",
    };

    for (const t of all) {
      if (!t.parentTaskId) { // üst seviye task'lar
        const col = colMap[t.status] ?? "📋 BACKLOG";
        columns[col].push(t);
      }
    }

    // Auto-detect ready tasks
    for (const t of columns["📋 BACKLOG"]) {
      if (tm.isReady(t.id)) {
        columns["🔵 READY"].push(t);
      }
    }
    columns["📋 BACKLOG"] = columns["📋 BACKLOG"].filter(t => !tm.isReady(t.id));

    console.log(brand.gold("\n    ◆ Kanban Board\n"));
    forgeDivider();

    for (const [col, tasks] of Object.entries(columns)) {
      if (tasks.length === 0) continue;

      console.log(`  ${col} (${tasks.length})`);
      console.log(`  ${"─".repeat(40)}`);

      for (const t of tasks) {
        const prioMark = t.priority === "critical" ? brand.red("▲▲") :
                         t.priority === "high" ? brand.gold("▲ ") :
                         t.priority === "medium" ? brand.cyan("● ") : brand.dim("○ ");
        const effort = t.effort ? brand.dim(` ${t.effort}pt`) : "";
        console.log(`  ${prioMark} ${brand.bold(t.id)} ${t.title}${effort}`);

        // Subtask'ları göster
        for (const subId of t.subtaskIds) {
          const sub = tm.get(subId);
          if (sub) {
            const subIcon = sub.status === "done" ? icon.done :
                           sub.status === "blocked" ? icon.block : icon.pending;
            console.log(`     ${brand.dim("└")} ${subIcon} ${brand.dim(sub.title)}`);
          }
        }
      }
      console.log("");
    }

    // Stats
    const stats = tm.stats();
    const bar = "█".repeat(Math.round(stats.progress / 5)) + "░".repeat(20 - Math.round(stats.progress / 5));
    console.log(`  ${brand.dim("Progress:")} ${brand.green(bar)} ${stats.progress}%`);
    console.log(`  ${brand.dim(`${stats.byStatus["done"] ?? 0}/${stats.total} done, ${stats.totalEffort} effort pts, ${stats.totalTokens} tokens`)}`);

    if (stats.blockers.length > 0) {
      console.log(`\n  ${icon.block} ${brand.red("Blockers:")}`);
      for (const b of stats.blockers) {
        console.log(`     ${brand.bold(b.id)} ${b.title}: ${brand.dim(b.reason)}`);
      }
    }
    console.log("");
  });

// ─── INTERNALS (dev/debug only) ───────────────────────────────

const intCmd = program
  .command("internals")
  .alias("int")
  .description("Geliştirici araçları (debug/inspect)");

intCmd
  .command("thoughts")
  .description("Thought listesi")
  .option("-c, --chain <id>", "Chain ID filtresi")
  .option("-s, --status <status>", "Status filtresi")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { chain?: string; status?: string; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const tm = new ThoughtManager(projectRoot);

    const filter: any = {};
    if (opts.chain) filter.chainId = opts.chain;
    if (opts.status) filter.status = opts.status;

    const list = tm.list(filter);

    if (list.length === 0) {
      console.log(`  ${icon.pending} Thought bulunamadı.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Thoughts (${list.length})\n`));
    for (const t of list) {
      const statusIcon = t.status === "done" ? icon.done
        : t.status === "blocked" ? icon.block
        : icon.pending;
      const layerIcon = icon[t.layer as keyof typeof icon] ?? "•";
      const conf = t.confidence > 0
        ? brand.dim(` ${(t.confidence * 100).toFixed(0)}%`)
        : "";

      console.log(
        `  ${statusIcon} ${brand.bold(t.id.padEnd(8))} ${layerIcon} ${brand.dim(t.layer.padEnd(11))} ${t.input.slice(0, 40)}${conf}`
      );
    }
    console.log("");
  });

intCmd
  .command("chains")
  .description("Chain listesi")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const cm = new ChainManager(projectRoot);

    const list = cm.list();

    if (list.length === 0) {
      console.log(`  ${icon.pending} Chain bulunamadı.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Chains (${list.length})\n`));
    for (const c of list) {
      const statusIcon = c.status === "completed" ? icon.done
        : c.status === "blocked" ? icon.block
        : icon.active;

      console.log(`  ${statusIcon} ${brand.bold(c.id.padEnd(25))} ${brand.gold(c.name)}`);
      console.log(`     ${brand.dim(`${c.thoughts.length} thoughts`)} ${icon.arrow} ${brand.dim(c.goal.slice(0, 40))}`);
    }
    console.log("");
  });

intCmd
  .command("history")
  .description("State geçiş tarihi")
  .option("-n, --count <n>", "Kaç geçiş", "10")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: { count: string; dir?: string }) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = StateManager.load(projectRoot, false);

    if (!sm) {
      console.log(`  ${icon.fail} Foreman projesi bulunamadı.`);
      return;
    }

    const history = sm.recentHistory(parseInt(opts.count));

    if (history.length === 0) {
      console.log(`  ${icon.pending} Henüz geçiş yok.`);
      return;
    }

    console.log(brand.gold("\n  ◆ State Geçişleri\n"));
    for (const h of history) {
      const time = brand.dim(h.at.slice(11, 19));
      const from = brand.dim(h.from);
      const to = brand.cyan(h.to);
      const ctx = [h.thoughtId, h.chainId].filter(Boolean).join(", ");

      console.log(`  ${time}  ${from} ${icon.arrow} ${to}`);
      console.log(`  ${brand.dim("         ")}${brand.dim(h.reason)}`);
      if (ctx) console.log(`  ${brand.dim("         ")}${brand.purple(ctx)}`);
    }
    console.log("");
  });

intCmd
  .command("memory")
  .alias("mem")
  .description("Memory listesi")
  .option("-d, --dir <path>", "Proje dizini")
  .option("-c, --category <cat>", "Kategori filtresi")
  .option("--hot", "Sadece hot memory")
  .option("-q, --query <q>", "Arama")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const mm = new MemoryManager(projectRoot);

    if (opts.query) {
      const results = mm.search(opts.query);
      if (results.length === 0) {
        console.log(`  ${icon.pending} Sonuç bulunamadı: "${opts.query}"`);
        return;
      }
      console.log(brand.gold(`\n  ◆ Arama: "${opts.query}" (${results.length} sonuç)\n`));
      for (const r of results.slice(0, 10)) {
        const score = brand.dim(`${(r.score * 100).toFixed(0)}%`);
        console.log(`  ${score} ${brand.bold(r.entry.id)} [${r.entry.category}] ${r.entry.content.slice(0, 50)}`);
      }
      console.log("");
      return;
    }

    const filter: any = {};
    if (opts.category) filter.category = opts.category;
    if (opts.hot) filter.minImportance = 0.8;

    const list = mm.list(filter);
    if (list.length === 0) {
      console.log(`  ${icon.pending} Memory bulunamadı.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Memory (${list.length})\n`));
    for (const e of list) {
      const tempIcon = e.importance >= 0.8 ? "🔥" : e.importance >= 0.5 ? "📌" : "📝";
      const uses = e.useCount > 0 ? brand.dim(` (${e.useCount}×)`) : "";
      const tags = e.tags.length > 0 ? brand.dim(` [${e.tags.join(",")}]`) : "";
      console.log(`  ${tempIcon} ${brand.bold(e.id.padEnd(8))} ${brand.cyan(`[${e.category}]`.padEnd(14))} ${e.content.slice(0, 45)}${uses}${tags}`);
    }
    console.log("");
  });

intCmd
  .command("sessions")
  .description("Session listesi")
  .option("-d, --dir <path>", "Proje dizini")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const sm = new SessionManager(projectRoot);
    const list = sm.list();

    if (list.length === 0) {
      console.log(`  ${icon.pending} Session bulunamadı.`);
      return;
    }

    console.log(brand.gold(`\n  ◆ Sessions (${list.length})\n`));
    for (const s of list) {
      const si = s.status === "active" ? brand.green("●") :
                 s.status === "completed" ? icon.done : brand.dim("○");
      const dur = s.endedAt
        ? brand.dim(` ${Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)}min`)
        : brand.green(" active");
      console.log(`  ${si} ${brand.bold(s.id)} ${brand.dim(s.startedAt.slice(0, 16))}${dur} ${icon.thought}${s.thoughtIds.length} ${icon.token}${s.totalTokens}`);
      if (s.summary) console.log(`     ${brand.dim(s.summary.slice(0, 60))}`);
    }
    console.log("");
  });

intCmd
  .command("cache")
  .description("Cache istatistikleri")
  .option("-d, --dir <path>", "Proje dizini")
  .option("--clear", "Cache'i temizle")
  .option("--purge", "Expired entry'leri sil")
  .action((opts: any) => {
    const projectRoot = resolve(opts.dir ?? process.cwd());
    const cm = new CacheManager(projectRoot);

    if (opts.clear) {
      const cleared = cm.clear();
      console.log(`  ${icon.done} ${cleared} cache entry silindi.`);
      return;
    }

    if (opts.purge) {
      const purged = cm.purgeExpired();
      console.log(`  ${icon.done} ${purged} expired entry silindi.`);
      return;
    }

    const s = cm.stats();
    console.log(brand.gold("\n  ◆ Cache Stats\n"));
    console.log(`  ${s.enabled ? brand.green("Enabled") : brand.red("Disabled")}`);
    console.log(`  Entries: ${brand.bold(String(s.entries))}/${s.maxEntries}`);
    console.log(`  Hits:    ${brand.bold(String(s.totalHits))}`);
    console.log(`  ${icon.token} Saved:  ${brand.green(String(s.totalTokensSaved))} tokens`);
    if (Object.keys(s.byLayer).length > 0) {
      console.log(`  ${brand.dim("By layer:")} ${Object.entries(s.byLayer).map(([k,v]) => `${k}(${v})`).join(", ")}`);
    }
    console.log("");
  });

intCmd
  .command("providers")
  .description("Provider durumu")
  .action(() => {
    console.log(brand.gold("\n  ◆ Provider Durumu\n"));
    printProviderStatus();
    console.log("");
  });

// ─── PARSE ────────────────────────────────────────────────────

program.parse();
