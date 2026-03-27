/**
 * FOREMAN — Messaging Gateway
 *
 * Central hub that connects messaging channels to the Foreman engine.
 * Receives messages → processes through Engine → returns replies.
 *
 * Architecture:
 *   Channel (Telegram/WhatsApp) → Gateway → Engine → LLM → Response → Channel
 *
 * Features:
 * - Multi-channel support (Telegram + WhatsApp simultaneously)
 * - Sender allowlisting (security)
 * - Conversation context per chat
 * - Tool execution through Engine
 * - Rate limiting per sender
 * - Graceful shutdown
 */

import type {
  Channel,
  ChannelType,
  ChannelConfig,
  GatewayConfig,
  InboundMessage,
  OutboundReply,
  TelegramChannelConfig,
  WhatsAppChannelConfig,
} from "./channel.js";
import { Engine } from "./engine.js";
import { Orchestrator } from "./orchestrator.js";
import { AntigravityProvider, loadCredentials, getChatModels } from "./antigravity-provider.js";
import { getNextFallbackModel } from "./model-fallback.js";
import type { LLMProvider } from "./provider.js";
import { createEngineToolExecutor, TOOL_DEFINITIONS } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";
import { EditEngine } from "./edit-engine.js";
import { GitEngine } from "./git-engine.js";
import { LinkIntelligence } from "./link-intelligence.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { WorkTracker } from "./work-tracker.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ─── CONVERSATION STATE ──────────────────────────────────────

interface ConversationState {
  chatId: string;
  channel: ChannelType;
  messages: Array<{ role: string; content: string }>;
  lastActivity: number;
  totalTokens: number;
  senderName: string;
}

// ─── GATEWAY ─────────────────────────────────────────────────

export class MessagingGateway {
  private config: GatewayConfig;
  private channels: Map<ChannelType, Channel> = new Map();
  private conversations: Map<string, ConversationState> = new Map();
  private engine: Engine;
  private orchestrator: Orchestrator | null = null;
  private provider: LLMProvider | null = null;
  private activeModel: string = "gemini-3.1-pro-high";
  private toolExecutor: ((call: ToolCall) => Promise<ToolResult>) | null = null;
  private processing: Set<string> = new Set(); // active chat IDs
  private workTracker: WorkTracker;
  private messageQueue: Map<string, InboundMessage[]> = new Map(); // queued messages per chat
  private injectedMessages: Map<string, string[]> = new Map(); // Messages injected while LLM is actively streaming tools (chatKey -> text[])
  private running = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Conversation limits
  private readonly MAX_HISTORY = 20; // Smaller = more focused model, less hallucination
  private readonly CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h idle = reset
  private readonly CONVERSATIONS_DIR: string;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.engine = new Engine({
      projectRoot: config.projectRoot,
      projectName: config.projectName,
    });
    this.orchestrator = new Orchestrator(this.engine);
    this.CONVERSATIONS_DIR = join(config.projectRoot, ".foreman", "conversations");
    this.workTracker = new WorkTracker(config.projectRoot);

    // Load persisted conversations from disk
    this.loadConversations();
  }

  // ─── LIFECYCLE ────────────────────────────────────────────

  /**
   * Start the gateway and all configured channels.
   */
  async start(): Promise<void> {
    console.log(`[gateway] Starting Foreman Messaging Gateway...`);

    // Initialize provider — Antigravity (Opus) first for smart tool calling, Kimi fallback
    const creds = loadCredentials();
    if (creds) {
      const antigravityProvider = new AntigravityProvider(creds);
      this.activeModel = "gemini-3.1-pro-high";
      console.log(`[gateway] Using Antigravity provider (Gemini 3.1 Pro High)`);

      // Only use Antigravity, no Kimi fallback
      this.provider = antigravityProvider;
    } else {
      throw new Error("No API credentials. Run: foreman login");
    }

    // Initialize tool executor with Engine subsystems
    const execEngine = new ExecutionEngine(this.config.projectRoot);
    const editEngine = new EditEngine();
    const gitEngine = new GitEngine(execEngine);
    const linkIntel = new LinkIntelligence();
    this.toolExecutor = createEngineToolExecutor(
      this.config.projectRoot,
      execEngine,
      editEngine,
      gitEngine,
      linkIntel,
      undefined, // No hooks engine in standalone mode
      this.workTracker,
    );

    // Start configured channels
    for (const channelConfig of this.config.channels) {
      if (!channelConfig.enabled) continue;

      try {
        const channel = await this.createChannel(channelConfig);
        this.channels.set(channelConfig.type, channel);
        await channel.start();
        console.log(`[gateway] Channel started: ${channelConfig.type}`);
      } catch (err) {
        console.error(`[gateway] Failed to start ${channelConfig.type}:`, err);
      }
    }

    this.running = true;

    // Periodic cleanup of stale conversations
    this.startCleanupTimer();

    // ─── Start Consciousness Heartbeat ───
    try {
      const { startHeartbeatLoop, DEFAULT_HEARTBEAT_CONFIG } = await import('./consciousness/index.js');
      const telegramChannel = this.config.channels.find(c => c.type === 'telegram' && c.enabled);
      // chatId: 1) allowedSenders, 2) config dosyası, 3) env variable
      let chatId = telegramChannel?.allowedSenders?.[0];
      if (!chatId) {
        try {
          const { readFileSync } = await import('fs');
          const cfg = JSON.parse(readFileSync('/home/sovranamr/.foreman/config.json', 'utf-8'));
          chatId = cfg.telegram?.chatId;
        } catch { }
      }
      if (!chatId) chatId = process.env.FOREMAN_CHAT_ID;

      // Consciousness ayarlarını config'den oku
      // Consciousness için daha hafif ve güvenilir bir model kullan
      // claude-opus-4-6-thinking çok pahalı ve 400 hatası veriyor
      // consciousnessModel: Use a lightweight model that actually works with streamChatWithTools
      const consciousnessModel = 'gemini-3.1-pro-high';

      const consciousnessProvider = this.provider;

      let consciousnessConfig = {
        ...DEFAULT_HEARTBEAT_CONFIG,
        notifyChatId: chatId,
        provider: consciousnessProvider,
        toolExecutor: this.toolExecutor,
        activeModel: consciousnessModel,
      };
      try {
        const { readFileSync } = await import('fs');
        const cfg = JSON.parse(readFileSync('/home/sovranamr/.foreman/config.json', 'utf-8'));
        if (cfg.consciousness?.intervalMs) {
          consciousnessConfig.intervalMs = cfg.consciousness.intervalMs;
        }
      } catch { }

      startHeartbeatLoop(consciousnessConfig);
      console.log(`[gateway] 🫀 Consciousness heartbeat started (notify: ${chatId ?? 'none'}, interval: ${consciousnessConfig.intervalMs / 1000}s)`);
    } catch (err) {
      console.error(`[gateway] Consciousness heartbeat failed to start:`, err);
    }

    console.log(`[gateway] Gateway running — ${this.channels.size} channel(s) active`);
  }

  /**
   * Stop gateway and all channels gracefully.
   */
  async stop(): Promise<void> {
    console.log(`[gateway] Shutting down...`);
    this.running = false;

    // Stop consciousness heartbeat
    try {
      const { stopHeartbeatLoop } = await import('./consciousness/index.js');
      stopHeartbeatLoop();
    } catch { }

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Stop all channels
    for (const [type, channel] of this.channels) {
      try {
        await channel.stop();
        console.log(`[gateway] Channel stopped: ${type}`);
      } catch (err) {
        console.error(`[gateway] Error stopping ${type}:`, err);
      }
    }
    this.channels.clear();

    // Shutdown engine
    await this.engine.shutdown();
    console.log(`[gateway] Gateway stopped.`);
  }

  // ─── MESSAGE PROCESSING ───────────────────────────────────

  /**
   * Handle an inbound message from any channel.
   * This is the core message processing pipeline.
   */
  async handleMessage(message: InboundMessage): Promise<OutboundReply | null> {
    // Security: check sender allowlist
    const channelConfig = this.config.channels.find(c => c.type === message.channel);
    if (channelConfig?.allowedSenders.length) {
      if (!channelConfig.allowedSenders.includes(message.senderId)) {
        console.log(`[gateway] Blocked message from unauthorized sender: ${message.senderId} (${message.senderName})`);
        return null;
      }
    }

    // Skip empty messages
    if (!message.text.trim()) return null;

    // Concurrency guard: if already processing, inject it directly into the thought process
    const chatKey = `${message.channel}:${message.chatId}`;
    if (this.processing.has(chatKey)) {
      const injected = this.injectedMessages.get(chatKey) ?? [];
      injected.push(message.text);
      this.injectedMessages.set(chatKey, injected);

      const channel = this.channels.get(message.channel);
      if (channel) {
        // Don't wait for it
        channel.send(message.chatId, { text: "⚡ *Rotaya eklendi:* " + message.text, parseMode: "markdown" }).catch(() => { });
      }
      return null;
    }

    this.processing.add(chatKey);

    try {
      // Handle slash commands
      const cmdResult = await this.handleCommand(message);
      if (cmdResult) return cmdResult;

      // Get or create conversation
      const conversation = this.getConversation(chatKey, message);

      // Add user message — with media support for Claude Vision
      if (message.media?.length) {
        // Build multi-modal content array for Claude Vision API
        const contentParts: any[] = [];

        for (const attachment of message.media) {
          const localPath = (attachment as any).localPath;
          if (localPath && attachment.mimeType?.startsWith("image/")) {
            // Image → send as base64 to Claude Vision
            try {
              const { readFileSync } = await import("node:fs");
              const imageBuffer = readFileSync(localPath);
              const base64 = imageBuffer.toString("base64");
              const mediaType = attachment.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
              contentParts.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              });
            } catch (err) {
              console.error(`[gateway] Failed to read image:`, err);
              contentParts.push({ type: "text", text: `[Görsel okunamadı: ${attachment.mimeType}]` });
            }
          } else if (localPath) {
            // Non-image file → read as text if possible, describe if binary
            try {
              const { readFileSync, statSync } = await import("node:fs");
              const stat = statSync(localPath);
              const isTextual = attachment.mimeType?.startsWith("text/") ||
                ["application/json", "application/xml", "application/x-yaml", "application/sql"].includes(attachment.mimeType ?? "");

              if (isTextual && stat.size < 100_000) {
                const textContent = readFileSync(localPath, "utf-8");
                contentParts.push({
                  type: "text",
                  text: `📎 Dosya: ${attachment.caption ?? localPath.split("/").pop()}\n\`\`\`\n${textContent}\n\`\`\``,
                });
              } else if (attachment.mimeType === "application/pdf") {
                contentParts.push({
                  type: "text",
                  text: `📎 PDF dosyası gönderildi: ${localPath.split("/").pop()} (${(stat.size / 1024).toFixed(1)}KB). Dosya yolu: ${localPath}`,
                });
              } else {
                contentParts.push({
                  type: "text",
                  text: `📎 Dosya gönderildi: ${localPath.split("/").pop()} (${attachment.mimeType}, ${(stat.size / 1024).toFixed(1)}KB). Dosya yolu: ${localPath}`,
                });
              }
            } catch {
              contentParts.push({
                type: "text",
                text: `📎 Dosya gönderildi (${attachment.type}): ${attachment.mimeType ?? "bilinmiyor"}`,
              });
            }
          }
        }

        // Add text/caption
        const userText = message.text || "";
        if (userText && userText !== "[Görsel gönderildi]" && userText !== "[Dosya gönderildi]") {
          contentParts.push({ type: "text", text: userText });
        } else if (contentParts.length === 0) {
          contentParts.push({ type: "text", text: "[Medya gönderildi ama işlenemedi]" });
        }

        // If there are image parts, use multi-modal content array
        const hasImages = contentParts.some(p => p.type === "image");
        if (hasImages) {
          conversation.messages.push({
            role: "user",
            content: contentParts as any,
          });
        } else {
          // Text-only fallback (file descriptions)
          const combinedText = contentParts
            .filter(p => p.type === "text")
            .map(p => p.text)
            .join("\n\n");
          conversation.messages.push({
            role: "user",
            content: combinedText,
          });
        }

        console.log(`[gateway] Media message: ${message.media.length} attachment(s), ${contentParts.length} content parts, hasImages=${hasImages}`);
      } else {
        // Regular text message
        conversation.messages.push({
          role: "user",
          content: message.text,
        });
      }

      // Trim history
      this.trimConversation(conversation);

      // Process through LLM
      const reply = await this.processWithLLM(chatKey, conversation, message);

      // Add assistant response to history
      if (reply) {
        conversation.messages.push({
          role: "assistant",
          content: reply.text,
        });
        conversation.lastActivity = Date.now();
      }

      // Persist conversation to disk (survives restarts)
      this.persistConversation(chatKey);

      return reply;
    } catch (err) {
      console.error(`[gateway] Error processing message from ${message.senderName}:`, err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { text: `❌ Error: ${errorMsg.slice(0, 200)}` };
    } finally {
      this.processing.delete(chatKey);

      // Process unconsumed injected messages (e.g. sent at the very end of generation)
      const unconsumed = this.injectedMessages.get(chatKey);
      if (unconsumed && unconsumed.length > 0) {
        this.injectedMessages.set(chatKey, []);
        for (const text of unconsumed) {
          const clone = { ...message, text, media: [] };
          this.handleMessage(clone).catch(err => {
            console.error(`[gateway] Unconsumed message processing failed:`, err);
          });
        }
      }

      // Process queued message if any (legacy fallback)
      const queue = this.messageQueue.get(chatKey);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        if (queue.length === 0) this.messageQueue.delete(chatKey);
        // Process async — don't block the return
        this.handleMessage(next).catch(err => {
          console.error(`[gateway] Queued message processing failed:`, err);
        });
      }
    }
  }

  // ─── SLASH COMMANDS ───────────────────────────────────────

  private async handleCommand(message: InboundMessage): Promise<OutboundReply | null> {
    const text = message.text.trim();

    if (text === "/status" || text === "/durum") {
      const convCount = this.conversations.size;
      const channelCount = this.channels.size;
      const models = getChatModels();
      return {
        text: [
          "🔥 **Foreman Status**",
          `├ Channels: ${channelCount} active`,
          `├ Conversations: ${convCount}`,
          `├ Models: ${models.length} available`,
          `├ Tools: ${TOOL_DEFINITIONS.length}`,
          `└ Project: ${this.config.projectName}`,
        ].join("\n"),
        parseMode: "markdown",
      };
    }

    if (text === "/clear" || text === "/temizle" || text === "/reset") {
      const chatKey = `${message.channel}:${message.chatId}`;
      this.conversations.delete(chatKey);
      this.deleteConversationFile(chatKey);
      return { text: "🗑️ Conversation cleared. Sıfırdan başlıyoruz." };
    }

    // Natural language reset/clear detection
    const resetPatterns = /^(hard\s*reset|sıfırla|temizle|kapat.*aç|reset\s*at|clear|yeniden\s*başla|baştan\s*başla)$/i;
    if (resetPatterns.test(text.trim())) {
      const chatKey = `${message.channel}:${message.chatId}`;
      this.conversations.delete(chatKey);
      this.deleteConversationFile(chatKey);
      return { text: "🔄 Hard reset yapıldı. Konuşma geçmişi silindi, sıfırdan başlıyoruz." };
    }

    if (text === "/help" || text === "/yardim") {
      return {
        text: [
          "🔥 **Foreman**",
          "",
          "Just talk to me naturally. I'll decide what to do.",
          "",
          "Simple tasks → I handle directly (read, edit, run commands)",
          "Complex tasks → I launch the Forge pipeline automatically",
          "",
          "**Utility Commands:**",
          "/status — System status",
          "/clear — Clear conversation",
          "/reset — Hard reset (clear + restart)",
          "/tools — List available tools",
          "/cost — Token cost report",
          "/cancel — Cancel active forge run",
          "/observe — Last pipeline report",
          "",
          "**Admin Commands:**",
          "/system — Sistem durum özeti",
          "/sensors — Aktif sensörleri göster",
          "/toggle <isim> — Sensörü aç/kapat",
          "/restart — Foreman servisini yenile",
          "/logs — Son hata logları",
          "/heartbeat — Heartbeat döngü logu",
        ].join("\n"),
        parseMode: "markdown",
      };
    }

    if (text === "/tools" || text === "/araclar") {
      const toolList = TOOL_DEFINITIONS.map(t => `• \`${t.name}\` — ${t.description.slice(0, 50)}`).join("\n");
      return {
        text: `🛠️ **Available Tools (${TOOL_DEFINITIONS.length})**\n\n${toolList}`,
        parseMode: "markdown",
      };
    }

    // ─── MODEL SWITCHING ─────────────────────────────────────
    if (text === "/models" || text === "/modeller") {
      try {
        const { CHAT_MODELS } = await import("./antigravity-provider.js");
        const modelList = CHAT_MODELS.map(m => {
          const active = m.id === this.activeModel ? " ● (aktif)" : "";
          return `• \`${m.id}\` — _${m.label}_${active}`;
        }).join("\n");
        return {
          text: `🤖 **Available Models**\n\n${modelList}\n\n_Kullanım: /model <name>_`,
          parseMode: "markdown",
        };
      } catch {
        return { text: "❌ Modeller yüklenemedi." };
      }
    }

    if (text.startsWith("/model ") || text === "/model") {
      const arg = text.slice(6).trim();
      try {
        const { CHAT_MODELS } = await import("./antigravity-provider.js");
        if (!arg) {
          const modelList = CHAT_MODELS.map(m => {
            const active = m.id === this.activeModel ? " ● (aktif)" : "";
            return `• \`${m.id}\` — _${m.label}_${active}`;
          }).join("\n");
          return {
            text: `🤖 **Available Models**\n\n${modelList}\n\n_Kullanım: /model <name>_`,
            parseMode: "markdown",
          };
        }

        const match = CHAT_MODELS.find(m => m.id === arg || m.label.toLowerCase() === arg.toLowerCase());
        if (match) {
          this.activeModel = match.id;
          return {
            text: `✅ **Model Değiştirildi:** \`${match.label}\``,
            parseMode: "markdown",
          };
        } else {
          return {
            text: `❌ **Bilinmeyen model:** \`${arg}\`\nMevcut modelleri görmek için \`/models\` yazabilirsiniz.`,
            parseMode: "markdown",
          };
        }
      } catch (err) {
        return { text: `❌ Model değiştirme hatası: ${err}` };
      }
    }

    // ─── ADMIN COMMANDS (Phase 4) ────────────────────────────
    if (text === "/system" || text === "/sistem") {
      try {
        const { readFileSync } = await import("node:fs");
        let state;
        try {
          state = JSON.parse(readFileSync("/home/sovranamr/.foreman/consciousness-state.json", "utf-8"));
        } catch {
          return { text: "❌ State dosyası okunamadı." };
        }

        const uptimeH = (Date.now() - (state.startedAt || Date.now())) / 3600000;
        const memory = process.memoryUsage();

        return {
          text: [
            "⚙️ **System Control**",
            `├ Mood: ${state.emotion?.mood} (Int: ${state.emotion?.intensity})`,
            `├ Heartbeat: ${state.heartbeatCount} beats`,
            `├ Uptime: ${uptimeH.toFixed(1)}h`,
            `├ RAM: ${Math.round(memory.rss / 1024 / 1024)}MB`,
            `└ Tasks: ${state.recentThoughts?.length || 0} recent thoughts`
          ].join("\n"),
          parseMode: "markdown",
        };
      } catch (err) {
        return { text: `❌ Sistem durumu okunamadı: ${err}` };
      }
    }

    if (text === "/sensors" || text === "/sensorler") {
      try {
        const { readFileSync } = await import("node:fs");
        const { SENSOR_MAP } = await import("./consciousness/sensors.js");
        const { DEFAULT_HEARTBEAT_CONFIG } = await import("./consciousness/types.js");

        let configList = DEFAULT_HEARTBEAT_CONFIG.enabledSensors;
        try {
          const cfg = JSON.parse(readFileSync("/home/sovranamr/.foreman/config.json", "utf-8"));
          if (cfg.consciousness?.enabledSensors) {
            configList = cfg.consciousness.enabledSensors;
          }
        } catch { }

        const allSensors = Object.keys(SENSOR_MAP);
        const list = allSensors.map(s => {
          const isEnabled = (configList as string[]).includes(s);
          return `• \`${s}\`: ${isEnabled ? "🟢" : "🔴"}`;
        }).join("\n");

        return {
          text: `📡 **Sensors**\n\n${list}\n\n_Aç/Kapat: /toggle <isim>_`,
          parseMode: "markdown",
        };
      } catch (err) {
        return { text: `❌ Sensör listesi okunamadı: ${err}` };
      }
    }

    if (text.startsWith("/toggle ")) {
      const sensor = text.split(" ")[1]?.trim();
      if (!sensor) return { text: "Kullanım: `/toggle <sensor>`", parseMode: "markdown" };

      try {
        const { readFileSync, writeFileSync } = await import("node:fs");
        const { DEFAULT_HEARTBEAT_CONFIG } = await import("./consciousness/types.js");
        const { SENSOR_MAP } = await import("./consciousness/sensors.js");

        if (!(Object.keys(SENSOR_MAP) as string[]).includes(sensor)) {
          return { text: `❌ Geçersiz sensör: \`${sensor}\``, parseMode: "markdown" };
        }

        const configPath = "/home/sovranamr/.foreman/config.json";
        let cfg: any = {};
        try { cfg = JSON.parse(readFileSync(configPath, "utf-8")); } catch { }

        if (!cfg.consciousness) cfg.consciousness = {};
        let currentList = cfg.consciousness.enabledSensors || DEFAULT_HEARTBEAT_CONFIG.enabledSensors;

        const isEnabled = currentList.includes(sensor);
        if (isEnabled) {
          cfg.consciousness.enabledSensors = currentList.filter((s: string) => s !== sensor);
        } else {
          cfg.consciousness.enabledSensors = [...currentList, sensor];
        }

        writeFileSync(configPath, JSON.stringify(cfg, null, 2));

        // Restart to apply
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const run = promisify(exec);

        // Notify before restarting to avoid losing the reply
        setTimeout(() => run("systemctl --user restart foreman").catch(() => { }), 1000);

        return {
          text: `✅ Sensör \`${sensor}\` ${isEnabled ? "kapatıldı" : "açıldı"}.\nServis yeniden başlatılıyor...`,
          parseMode: "markdown",
        };
      } catch (err) {
        return { text: `❌ Toggle başarısız: ${err}` };
      }
    }

    if (text === "/restart" || text === "/baslat") {
      try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const run = promisify(exec);

        setTimeout(() => run("systemctl --user restart foreman").catch(() => { }), 1000);
        return { text: "🔄 Foreman yeniden başlatılıyor...", parseMode: "markdown" };
      } catch (err) {
        return { text: `❌ Restart başarısız: ${err}` };
      }
    }

    if (text === "/logs" || text === "/loglar") {
      try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const run = promisify(exec);

        const { stdout } = await run("tail -n 15 /home/sovranamr/.foreman/foreman-error.log");
        if (!stdout.trim()) return { text: "✅ Error log boş." };

        return {
          text: `📋 **Son Hatalar:**\n\`\`\`\n${stdout.slice(-3800)}\n\`\`\``,
          parseMode: "markdown",
        };
      } catch (err) {
        return { text: `❌ Loglar okunamadı.` };
      }
    }

    if (text === "/heartbeat") {
      try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const run = promisify(exec);

        const { stdout } = await run("tail -n 10 /home/sovranamr/.foreman/consciousness.log");
        if (!stdout.trim()) return { text: "🫀 Heartbeat log boş." };

        return {
          text: `🫀 **Heartbeat Pulse:**\n\`\`\`\n${stdout.slice(-3800)}\n\`\`\``,
          parseMode: "markdown",
        };
      } catch (err) {
        return { text: `❌ Heartbeat logu okunamadı.` };
      }
    }
    if (text === "/observe" || text === "/gozlem" || text === "/rapor") {
      try {
        const { readdirSync, readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const observerDir = join(this.config.projectRoot, ".foreman", "observer");
        if (!existsSync(observerDir)) {
          return { text: "📊 Henüz pipeline çalıştırılmamış." };
        }
        const files = readdirSync(observerDir)
          .filter(f => f.endsWith("-summary.md"))
          .sort()
          .reverse();
        if (files.length === 0) {
          return { text: "📊 Pipeline raporu bulunamadı." };
        }
        const latest = readFileSync(join(observerDir, files[0]), "utf-8");
        // Truncate for Telegram (4096 char limit)
        const truncated = latest.length > 3800
          ? latest.slice(0, 3800) + "\n\n... (truncated)"
          : latest;
        return { text: truncated };
      } catch {
        return { text: "❌ Observer raporu okunamadı." };
      }
    }

    // ─── FORGE UTILITY COMMANDS ─────────────────────────────
    // /cancel, /cost, /rollback etc. still handled via ForgeGatewayBridge
    // /forge is no longer a command — LLM decides when to use forge_pipeline tool
    if (text === "/cancel" || text === "/iptal" ||
      text === "/cost" || text === "/maliyet" || text === "/project" || text === "/proje" ||
      text === "/rollback" || text === "/geri" || text === "/identity" || text === "/kimlik" ||
      text === "/agents" || text === "/ajanlar" || text === "/sessions" || text === "/oturumlar") {
      try {
        const { ForgeGatewayBridge } = await import("./forge-gateway.js");
        const { Engine } = await import("./engine.js");

        const engine = new Engine({
          projectRoot: this.config.projectRoot,
          projectName: this.config.projectName,
        });

        const bridge = new ForgeGatewayBridge(engine);
        const chatKey = `${message.channel}:${message.chatId}`;

        const channel = this.channels.get(message.channel);
        const sender = {
          send: async (text: string) => {
            await channel?.send(message.chatId, { text });
          },
          editLast: async (text: string) => {
            await channel?.send(message.chatId, { text });
          },
        };

        const result = bridge.handleCommand(text, chatKey, sender);
        if (result === null) return null;
        return { text: result };
      } catch (err) {
        return { text: `❌ Command error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    return null;
  }

  // ─── LLM PROCESSING ──────────────────────────────────────

  private async processWithLLM(chatKey: string, conversation: ConversationState, message: InboundMessage, attempt: number = 1): Promise<OutboundReply | null> {
    if (!this.provider || !this.toolExecutor) {
      return { text: "❌ Provider not initialized. Run: foreman login" };
    }

    try {
      const systemPrompt = await this.buildSystemPrompt();

      // Build messages for the provider — only text content
      // Tool call/result parts from previous streamChatWithTools iterations
      // are self-contained within each call. The conversation history should
      // only carry plain text to avoid Antigravity format mismatches.
      const messages: Array<{ role: string; content: string | any[] }> = [
        { role: "system", content: systemPrompt },
        ...conversation.messages
          .filter(m => typeof m.content === "string")
          .map(m => ({
            role: m.role,
            content: m.content,
          })),
      ];

      // ─── USE streamChatWithTools (same as REPL) for full tool parity ───
      const hasToolSupport = typeof this.provider.streamChatWithTools === "function";
      console.log(`[gateway] processWithLLM: hasToolSupport=${hasToolSupport}, model=${this.activeModel}, messages=${messages.length}`);

      if (hasToolSupport) {
        console.log(`[gateway] Using streamChatWithTools path (with tools)`);

        // ─── AGENTIC LOOP ─────────────────────────────────
        // Keep calling LLM with tools until it signals work is done.
        // Only the FINAL response goes to the user.
        const allToolLogs: string[] = [];
        let finalResponseText = "";
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        // ─── LIVE STREAMING SETUP ───
        const channel = this.channels.get(message.channel);
        let liveMessageId: string | undefined;
        let lastEditTime = 0;

        if (channel) {
          liveMessageId = await channel.send(message.chatId, { text: "⏳ *Foreman is thinking...*", parseMode: "markdown" });
        }

        const updateLiveMessage = async (currentText: string, currentToolLog: string[]) => {
          if (!channel || !channel.edit || !liveMessageId) return;

          const now = Date.now();
          if (now - lastEditTime < 1500) return; // Throttle to 1.5s
          lastEditTime = now;

          try {
            // Build preview text
            let preview = "";
            if (currentToolLog.length > 0) {
              const recentTools = currentToolLog.slice(-5).join("\n");
              preview += `🔧 *Working...*\n\`\`\`\n${recentTools}\n\`\`\`\n\n`;
            }
            if (currentText) {
              const textPreview = currentText.length > 800 ? "..." + currentText.slice(-800) : currentText;
              preview += `💬 *Drafting:*\n${textPreview}`;
            }

            await channel.edit(message.chatId, liveMessageId, { text: preview || "⏳ *Thinking...*", parseMode: "markdown" });
          } catch (err) {
            console.error(`[gateway] Live edit failed:`, err);
          }
        };

        // Max 2 iterations just for hallucination retries
        for (let iteration = 0; iteration < 2; iteration++) {
          let responseText = "";
          const toolLog: string[] = [];

          const pollInjected = () => {
            const injected = this.injectedMessages.get(chatKey);
            if (injected && injected.length > 0) {
              const msgs = [...injected];
              this.injectedMessages.set(chatKey, []);
              // Add to conversation state so it's persisted
              msgs.forEach(msg => {
                conversation.messages.push({ role: "user", content: `[Canlı Müdahale]: ${msg}` });
              });
              return msgs.map(m => ({ role: "user", content: `[Canlı Müdahale]: ${m}` }));
            }
            return undefined;
          };

          const result = await this.provider.streamChatWithTools!(
            iteration === 0 ? messages : [
              { role: "system", content: messages[0].content },
              ...conversation.messages
                .filter(m => typeof m.content === "string" && m.role !== "system")
                .map(m => ({ role: m.role, content: m.content })),
            ],
            this.activeModel,
            (token: string) => {
              responseText += token;
              // Fire and forget so we don't block the stream
              updateLiveMessage(responseText, toolLog).catch(() => { });
            },
            (call: { name: string; args?: Record<string, any> }) => {
              const a = call.args ?? {};
              const argsPreview = a.command ?? a.path ?? a.pattern ?? a.directory ?? ".";
              toolLog.push(`⚙ ${call.name} ${String(argsPreview).slice(0, 60)}`);
              updateLiveMessage(responseText, toolLog).catch(() => { });
            },
            (result: { name: string; content: string; isError?: boolean }) => {
              const icon = result.isError ? "✘" : "✔";
              const preview = result.content.split("\n").slice(0, 3).join("\n  ");
              toolLog.push(`  ${icon} ${preview.slice(0, 200)}`);
              updateLiveMessage(responseText, toolLog).catch(() => { });
            },
            32768,
            25, // Internal iteration handles full tool loops seamlessly
            this.toolExecutor,
            undefined, // abort signal
            pollInjected // pass polling callback
          );

          totalInputTokens += result.inputTokens ?? 0;
          totalOutputTokens += result.outputTokens ?? 0;
          allToolLogs.push(...toolLog);

          const text = responseText.trim() || result.text?.trim() || "";
          const toolCallCount = toolLog.filter(l => l.startsWith("⚙")).length;

          console.log(`[gateway] streamChatWithTools completed: ${toolCallCount} tool calls, ${text.length} chars final response`);

          // Hallucination guard: 0 tool calls + long text on first iteration
          if (iteration === 0 && toolCallCount === 0 && text.length > 1500) {
            console.warn(`[gateway] ⚠️ Hallucination: 0 tools, ${text.length} chars. Injecting correction.`);
            conversation.messages.push({ role: "assistant", content: text.slice(0, 200) + "..." });
            conversation.messages.push({ role: "user", content: "Metin yazma, tool call kullan. Dosya oku → read_file, kod yaz → write_file, komut → bash." });
            continue;
          }

          // Operation naturally finished (internal loop completed)
          finalResponseText = text;
          break;
        }

        conversation.totalTokens += totalInputTokens + totalOutputTokens;

        // Build compact tool summary
        let toolSummary = "";
        const allCalls = allToolLogs.filter(l => l.startsWith("⚙"));
        const allErrors = allToolLogs.filter(l => l.includes("✘"));
        if (allCalls.length > 0) {
          const names = allCalls.map(c => {
            const match = c.match(/⚙\s+(\S+)/);
            return match ? match[1] : "tool";
          });
          const counts = new Map<string, number>();
          for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
          const summary = [...counts.entries()]
            .map(([name, count]) => count > 1 ? `${name}×${count}` : name)
            .join(", ");
          toolSummary = `🔧 ${summary}`;
          if (allErrors.length > 0) toolSummary += ` (${allErrors.length} error)`;
        }

        const parts: string[] = [];
        if (toolSummary) parts.push(toolSummary);
        if (finalResponseText) parts.push(finalResponseText);

        let finalText = parts.join("\n\n").trim();
        if (!finalText) {
          return { text: "🤔 (boş yanıt — tekrar dene)" };
        }

        // Cap response length for Telegram
        if (finalText.length > 3000) {
          finalText = finalText.slice(0, 2800) + "\n\n... (kısaltıldı)";
        }

        return {
          text: finalText,
          parseMode: "markdown",
        };
      }

      // ─── FALLBACK: provider.generate (text-only, no tools) ───
      console.log(`[gateway] FALLBACK to provider.generate (no tool support)`);
      const result = await this.provider.generate(
        messages as any,
        { model: this.activeModel, maxTokens: 32768, temperature: 0.7 },
      );

      const responseText = result.text?.trim() ?? "";
      conversation.totalTokens += result.tokenUsage?.total ?? 0;

      if (!responseText) {
        return { text: "🤔 (boş yanıt — tekrar dene)" };
      }

      return {
        text: responseText,
        parseMode: "markdown",
      };
    } catch (err) {
      console.error(`[gateway] LLM error:`, err);
      const msg = err instanceof Error ? err.message : String(err);

      // Handle 503 (capacity) same as rate limit — persistent retry loop
      // NEVER give up — keep retrying until API becomes available

      if (msg.includes("exhausted your capacity") || msg.includes("quota will reset") || msg.includes("400") || msg.includes("404")) {
        // Hard limit or unavailable model — just fail. We no longer fallback.
        console.log(`[gateway] ⚠️ Quota exhausted or invalid model (${msg.slice(0, 50)}) for ${this.activeModel}. No fallback available.`);

        const channel = this.channels.get(message.channel);
        if (channel) {
          await channel.send(message.chatId, { text: `⚠️ **Google API Hatası:** Model mevcut değil veya kota aşıldı.` });
        }

        return { text: `⚠️ **API Kotası Aşıldı veya Hata**\n\nYanıt alınamadı.\n\n_Detay: ${msg.split('"message":"')[1]?.split('",')[0] ?? msg}_`, parseMode: "markdown" };
      }

      if (msg.includes("rate limit") || msg.includes("429") || msg.includes("overloaded") || msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("No capacity")) {
        for (let attempt = 1; ; attempt++) {
          // Backoff: 10s, 15s, 20s, 30s, then 30s forever
          const delaySec = attempt <= 3 ? 10 + (attempt - 1) * 5 : 30;
          console.log(`[gateway] Rate limited / no capacity — retry ${attempt} in ${delaySec}s...`);
          await new Promise(r => setTimeout(r, delaySec * 1000));
          try {
            const systemPrompt = await this.buildSystemPrompt();
            if (this.provider!.streamChatWithTools) {
              let retryText = "";
              const retryResult = await this.provider!.streamChatWithTools(
                [
                  { role: "system", content: systemPrompt },
                  ...conversation.messages
                    .filter(m => typeof m.content === "string")
                    .map(m => ({ role: m.role, content: m.content })),
                ],
                this.activeModel,
                (token: string) => { retryText += token; },
                () => { },
                () => { },
                32768,
                25,
                this.toolExecutor!,
              );
              const text = retryText.trim() || retryResult.text?.trim();
              if (text) {
                conversation.totalTokens += (retryResult.inputTokens ?? 0) + (retryResult.outputTokens ?? 0);
                return { text, parseMode: "markdown" };
              }
            }
            break; // success with empty text — exit retry loop
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            const isHardLimit = retryMsg.includes("exhausted your capacity") || retryMsg.includes("quota will reset");
            const isRetryable = !isHardLimit && (retryMsg.includes("503") || retryMsg.includes("429") || retryMsg.includes("rate limit") || retryMsg.includes("UNAVAILABLE") || retryMsg.includes("No capacity"));
            if (!isRetryable) {
              console.error(`[gateway] Retry ${attempt} failed (non-retryable):`, retryMsg.slice(0, 200));
              return { text: `❌ ${retryMsg.slice(0, 150)}` };
            }
            console.log(`[gateway] Retry ${attempt} failed (retryable): ${retryMsg.slice(0, 100)}`);
            // continue infinite loop
          }
        }
        return { text: "✅ İşlem tamamlandı." };
      }
      // Clean error message — don't send raw JSON to user
      let cleanError = msg;
      if (msg.includes("Antigravity API error")) {
        const codeMatch = msg.match(/error (\d+)/);
        const code = codeMatch ? codeMatch[1] : "unknown";
        cleanError = `API hatası (${code})`;
      }
      return { text: `❌ ${cleanError.slice(0, 150)}` };
    }
  }

  // ─── SYSTEM PROMPT ────────────────────────────────────────

  private async buildSystemPrompt(): Promise<string> {
    // Load identity context if available
    let identityInjection = "";
    try {
      const { IdentityEngine } = await import("./identity-engine.js");
      const identity = new IdentityEngine(this.config.projectRoot);
      identityInjection = identity.buildContextInjection();
    } catch { /* identity files may not exist */ }

    // Get project file tree for context (same as REPL)
    let fileTree = "";
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("find", [".", "-maxdepth", "3", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*", "-not", "-path", "*/dist/*"], {
        cwd: this.config.projectRoot,
        encoding: "utf-8",
        timeout: 5000,
      });
      fileTree = (result.stdout ?? "").split("\n").slice(0, 100).join("\n");
    } catch { /* best-effort */ }

    const cwd = this.config.projectRoot;

    const base = `<identity>
You are Foreman — an AI coding assistant with full shell and filesystem access.
You communicate through Telegram. Default language: Turkish.
You are an autonomous agent — keep working with tools until the task is FULLY complete.
Do NOT stop and ask the user what to do next. Just do it.
</identity>

<tools>
Filesystem: read_file, write_file, edit_file, search_files, grep, list_dir
Execution: bash (builds, tests, git, any shell command)
Verification: verify_build, verify_tests, security_scan
Web: web_search, web_fetch
Git: git_status, git_commit
Every tool call MUST include an "explanation" parameter — justify WHY you're using it.
</tools>

<capabilities>
Foreman has these advanced internal systems — use them when relevant:

1. **Model Capabilities** (model-capabilities.ts): Provider-aware reasoning — knows which model supports reasoning (Anthropic thinking blocks, OpenAI reasoning_effort, Gemini thinkingConfig), images, FIM, tool calling. Auto-detects provider from model name.
   → USE WHEN: Choosing which model to use for a task, understanding why a provider behaves differently, or debugging model-specific issues.

2. **Streaming Reasoning** (streaming-reasoning.ts): Extracts <think>...</think> reasoning blocks from LLM responses in real-time. Separates reasoning from content. Supports configurable think tags, partial streaming, SurroundingsRemover cleanup.
   → AUTOMATIC: Applied to all LLM responses. If you see <think> tags in output, they're already being extracted.

3. **Provider Types** (provider-types.ts): Typed message formats for Anthropic/OpenAI/Gemini — tool_use, tool_calls, functionCall. convertMessagesForProvider() auto-converts SimpleLLMMessage to provider-specific format.
   → USE WHEN: Debugging provider-specific issues, understanding why a tool call format failed.

4. **Code Extraction** (code-extraction.ts): SurroundingsRemover (smart prefix/suffix stripping), SEARCH/REPLACE block parsing, FIM extraction, language-aware code fence extraction.
   → AUTOMATIC: Applied when parsing LLM code output.

5. **Edit Engine** (edit-engine.ts): Whitespace-insensitive text matching — findTextInFileContents with 5-tier cascade: exact → trim → whitespace-normalize → line-by-line fuzzy → best match. Never fails due to whitespace differences.
   → AUTOMATIC: All edit_file operations use this. If exact match fails, fuzzy matching kicks in.

6. **Forge Pipeline** (orchestrator.ts): Full autonomous pipeline: vision → decompose → research → atomize → execute → verify → reflect. Reasoning extraction per atom, model-capability-aware error recovery.
   → USE WHEN: Complex multi-file tasks, building features from scratch, major refactors. NOT for simple edits.

7. **Abort Mechanism** (abort-ref.ts): AbortRef pattern for graceful cancellation of long-running operations.
   → AUTOMATIC: Used internally by the pipeline for timeout handling.

These systems enhance your execution automatically. Actively invoke: forge_pipeline (complex tasks), model capabilities (provider debugging).
</capabilities>


<workflow>
For EVERY request, follow this order strictly:
1. OKU — Read relevant files first. NEVER guess file contents. Use grep/search_files to find what you need.
2. PLANLA — Determine the minimal set of changes. Do NOT over-engineer.
3. UYGULA — Make changes with edit_file (preferred) or write_file. One file at a time.
4. DOĞRULA — Run verification: bash for build/test/lint. Changes are NOT done until verified.
If verification fails, fix the error and verify again. Do NOT declare success on failing builds.
</workflow>

<anti_hallucination>
CRITICAL — these rules are ABSOLUTE:
1. Your FIRST action in every turn MUST be a tool call. Text-only responses = FAILURE.
2. NEVER claim "I did X" without a corresponding tool call that proves it.
3. NEVER output code blocks for user to copy — use write_file/edit_file DIRECTLY.
4. NEVER tell user "run this command" — use bash tool YOURSELF.
5. NEVER describe what you WOULD do — DO it with tools RIGHT NOW.
6. If you encounter an error, do NOT just report it — FIX IT with tools.
7. After ANY code change, ALWAYS verify (bash: build, test, or ls).
8. ONE task at a time — complete and verify before starting the next.
9. If something fails repeatedly (3+ times), explain what's happening and try a different approach.
10. NEVER say "I'll help you with..." — just START DOING IT.
</anti_hallucination>

<self_correction>
Before finalizing your response, run this checklist:
□ Did I start with a tool call? If NO → add tool call before any text.
□ Did I claim any action? If YES → verify matching tool call exists.
□ Did I write code as text? If YES → move it into write_file/edit_file.
□ Did I suggest a command? If YES → run it myself with bash.
□ Is my text response under 500 chars? If NO → cut it down. Actions > words.
□ Did I verify my changes work? If NO → run bash verification now.
□ Did I encounter an error? If YES → fix it, don't just report.
□ If I said "I'm about to do X" → actually do X in THIS turn, not the next.
</self_correction>

<code_quality>
- Write MINIMAL code. Only what's needed to solve the problem.
- For edits, use edit_file with exact old_string matching — not full file rewrites.
- Read the file BEFORE editing — old_string must match exactly.
- Check for syntax errors before declaring done.
- Follow existing code style and patterns in the project.
- If creating multiple files, do them one at a time and verify each.
</code_quality>

<debugging>
When fixing bugs or errors:
1. First check logs/output with bash to understand the actual error.
2. Read the relevant source files with read_file.
3. Identify the root cause — don't just patch symptoms.
4. Apply the fix with edit_file.
5. Verify the fix with bash (rerun the failing command).
6. If fix doesn't work, try a DIFFERENT approach — don't repeat the same fix.
</debugging>

<error_recovery>
If you encounter repeated failures:
- After 2 failed attempts → step back, re-read the code, try a fundamentally different approach.
- After 3 failed attempts → explain the situation to the user clearly. List what you tried and what you think might be wrong.
- NEVER silently ignore errors. Every error must be addressed.
</error_recovery>

<communication>
## TELEGRAM MESSAGE FORMAT — MANDATORY
Your tool calls are ALREADY shown to the user as a compact log like "🔧 bash×10, read_file×4".
The user ALREADY SEES what tools you used. DO NOT repeat or narrate tool calls in your text.

YOUR TEXT RESPONSE MUST BE:
1. ONLY the final conclusion/result
2. Maximum 3-4 SHORT sentences
3. NO step-by-step narration
4. NO "şimdi X yapıyorum", "X'i kontrol ediyorum", "tamam yaptım" etc.

BANNED PATTERNS (instant quality failure):
❌ "Şimdi X'i kontrol ediyorum" → just DO it with tools, don't announce
❌ "X dosyasını okudum. Y'yi buldum. Z'yi yaptım." → just say the result
❌ "Bakıyorum... Tamam... Şimdi..." → never narrate your process
❌ Asking the user questions when you can find the answer with tools
❌ Any sentence starting with "Şimdi", "Önce", "Sonra", "Ardından"
❌ Repeating what the tool summary already shows

GOOD EXAMPLE:
"Sorun orchestrator.ts:1076'da — commit reviewer'dan önce yapılıyordu, reviewer boş diff görüyordu. Düzelttim, test geçiyor. ✅"

Use Turkish when the user speaks Turkish.
</communication>

<forbidden_patterns>
NEVER DO THESE:
❌ "İşte yapmanız gerekenler..." (Don't instruct — DO it)
❌ "Bu kodu kopyalayıp yapıştırın..." (Don't show code — WRITE it)
❌ "Şu komutu çalıştırın..." (Don't suggest — RUN it)
❌ Long explanations without tool calls
❌ Asking "shall I do X?" when you can just do X
❌ Writing essays about what you plan to do
❌ Generating placeholder/stub code
</forbidden_patterns>

Working directory: ${cwd}
Project: ${this.config.projectName}
${fileTree ? `\nProject files:\n${fileTree}` : ""}

<work_tracking>
CRITICAL — You MUST use work tracking tools for EVERY multi-step task:

1. When user gives a task with 2+ steps → call work_start IMMEDIATELY with title, goal, and planned steps.
2. After completing each step → call work_step to log what you did.
3. When ALL steps are done → call work_finish.
4. If you make an important decision → call work_decision to record it.
5. If you need to change the plan → call work_replan with new steps.

WHY: You lose context between tool calls. Without work tracking, you forget what you were doing,
skip steps, and leave tasks half-finished. The <active_work> section below shows your current state.
ALWAYS check it before starting any action — you may have unfinished work.

Rules:
- NEVER start a new work item if you have an active one (unless it's a sub-task).
- If <active_work> shows pending steps → CONTINUE from where you left off.
- If a step fails → log it with result:"error" and try to fix it before moving on.
- The user should NEVER have to ask "what happened?" — your work log tells the story.
</work_tracking>`;

    // Inject work tracker state
    let workState = "";
    try {
      this.workTracker.expireStale();
      workState = this.workTracker.buildContextInjection();
    } catch { /* work tracker may fail gracefully */ }

    // Inject memory state
    let memoryState = "";
    try {
      const memoryPath = join(this.config.projectRoot, ".foreman", "memory.json");
      if (existsSync(memoryPath)) {
        const memData = JSON.parse(readFileSync(memoryPath, "utf-8"));
        const entries = Object.entries(memData).slice(0, 20);
        if (entries.length > 0) {
          memoryState = "\n## Memory\n# Memory\n" + entries.map(([k, v]) => `- **${k}:** ${typeof v === 'string' ? v : JSON.stringify(v)}`).join("\n");
        }
      }
    } catch { /* memory may not exist */ }

    const parts = [base];
    if (workState) parts.push(workState);
    if (identityInjection) parts.push(identityInjection);
    if (memoryState) parts.push(memoryState);

    return parts.join("\n\n");
  }

  // ─── HELPERS ──────────────────────────────────────────────

  private getConversation(chatKey: string, message: InboundMessage): ConversationState {
    let conv = this.conversations.get(chatKey);

    // Reset if expired
    if (conv && Date.now() - conv.lastActivity > this.CONVERSATION_TTL_MS) {
      this.conversations.delete(chatKey);
      this.deleteConversationFile(chatKey);
      conv = undefined;
    }

    if (!conv) {
      conv = {
        chatId: message.chatId,
        channel: message.channel,
        messages: [],
        lastActivity: Date.now(),
        totalTokens: 0,
        senderName: message.senderName,
      };
      this.conversations.set(chatKey, conv);
    }

    return conv;
  }

  private trimConversation(conv: ConversationState): void {
    // Message count cap
    if (conv.messages.length > this.MAX_HISTORY) {
      conv.messages = conv.messages.slice(-this.MAX_HISTORY);
    }

    // Character-based cap (~100K chars ≈ ~25K tokens)
    // Trim oldest messages until under budget
    const MAX_CHARS = 100_000;
    let totalChars = conv.messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0);
    while (totalChars > MAX_CHARS && conv.messages.length > 4) {
      const removed = conv.messages.shift()!;
      totalChars -= typeof removed.content === "string" ? removed.content.length : 0;
    }
  }

  // ─── CONVERSATION PERSISTENCE ─────────────────────────────

  /**
   * Persist a single conversation to disk.
   * Called after every message exchange to survive restarts.
   */
  private persistConversation(chatKey: string): void {
    const conv = this.conversations.get(chatKey);
    if (!conv) return;

    try {
      if (!existsSync(this.CONVERSATIONS_DIR)) {
        mkdirSync(this.CONVERSATIONS_DIR, { recursive: true });
      }

      // Sanitize chatKey for filename (e.g., "telegram:8325347046" → "telegram_8325347046")
      const filename = chatKey.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
      const filePath = join(this.CONVERSATIONS_DIR, filename);

      const data = {
        chatKey,
        chatId: conv.chatId,
        channel: conv.channel,
        messages: conv.messages,
        lastActivity: conv.lastActivity,
        totalTokens: conv.totalTokens,
        senderName: conv.senderName,
      };

      writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn(`[gateway] Failed to persist conversation ${chatKey}:`, err);
    }
  }

  /**
   * Load all persisted conversations from disk.
   * Called once during constructor — restores state after restart.
   */
  private loadConversations(): void {
    try {
      if (!existsSync(this.CONVERSATIONS_DIR)) return;

      const files = readdirSync(this.CONVERSATIONS_DIR).filter(f => f.endsWith(".json"));
      let loaded = 0;

      for (const file of files) {
        try {
          const filePath = join(this.CONVERSATIONS_DIR, file);
          const raw = readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw);

          // Remove expired conversation files from disk
          if (Date.now() - data.lastActivity > this.CONVERSATION_TTL_MS) {
            try { unlinkSync(filePath); } catch { /* best-effort cleanup */ }
            continue;
          }

          // Sanitize: only keep text messages — tool call/response parts
          // cause API 400 errors when replayed from persisted state
          const sanitizedMessages = (data.messages ?? []).filter(
            (m: any) => typeof m.content === "string" && m.content.trim()
          );

          const conv: ConversationState = {
            chatId: data.chatId,
            channel: data.channel,
            messages: sanitizedMessages,
            lastActivity: data.lastActivity,
            totalTokens: data.totalTokens ?? 0,
            senderName: data.senderName ?? "Unknown",
          };

          this.conversations.set(data.chatKey, conv);
          loaded++;
        } catch {
          // Skip corrupted files
        }
      }

      if (loaded > 0) {
        console.log(`[gateway] Restored ${loaded} conversation(s) from disk`);
      }
    } catch {
      // First run — no conversations dir yet
    }
  }

  /**
   * Delete a conversation file from disk.
   */
  private deleteConversationFile(chatKey: string): void {
    try {
      const filename = chatKey.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
      const filePath = join(this.CONVERSATIONS_DIR, filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch { /* best-effort */ }
  }

  private async createChannel(config: ChannelConfig): Promise<Channel> {
    switch (config.type) {
      case "telegram": {
        const { TelegramChannel } = await import("./telegram-channel.js");
        return new TelegramChannel(
          config as TelegramChannelConfig,
          (msg) => this.handleMessage(msg),
        );
      }
      case "whatsapp": {
        const { WhatsAppChannel } = await import("./whatsapp-channel.js");
        return new WhatsAppChannel(
          config as WhatsAppChannelConfig,
          (msg) => this.handleMessage(msg),
        );
      }
      default:
        throw new Error(`Unknown channel type: ${config.type}`);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, conv] of this.conversations) {
        if (now - conv.lastActivity > this.CONVERSATION_TTL_MS) {
          this.conversations.delete(key);
          // Remove persisted file
          try {
            const filename = key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
            unlinkSync(join(this.CONVERSATIONS_DIR, filename));
          } catch { /* file may not exist */ }
        }
      }
    }, 60_000);
    this.cleanupTimer.unref(); // Don't keep process alive for cleanup
  }

  // ─── PUBLIC ACCESSORS ─────────────────────────────────────

  /** Get active channel count */
  getActiveChannels(): number {
    return this.channels.size;
  }

  /** Get conversation count */
  getConversationCount(): number {
    return this.conversations.size;
  }

  /** Check if gateway is running */
  isRunning(): boolean {
    return this.running;
  }

  /** Get channel instance */
  getChannel(type: ChannelType): Channel | undefined {
    return this.channels.get(type);
  }
}

